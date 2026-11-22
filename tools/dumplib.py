"""Read Luau data out of a dump made by fldump.py (no root needed).

Layout found in Roblox's Luau (Sober build, Nov 2026):
  TString : 24-byte header (byte1 = tag 6), u32 length at +20, text at +24
  TValue  : 8-byte value, 4-byte extra, 4-byte tag   (1 bool, 3 number, 6 string, 7 table)
  Table   : 48-byte header, byte1 = tag 7, lsizenode at +4, nodemask at +7,
            sizearray at +8, hash nodes at +24, array part at +40
  LuaNode : 32 bytes = value TValue, then key (key tag = low 4 bits of the last u32)
"""
import bisect
import mmap
import re
import struct


class Dump:
    def __init__(self, path):
        f = open(path, 'rb')
        self.m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        self.runs = []  # (address, length, file offset)
        off, n = 0, len(self.m)
        while off < n:
            a, l = struct.unpack_from('<QQ', self.m, off)
            off += 16
            self.runs.append((a, l, off))
            off += l
        self.starts = [r[0] for r in self.runs]

    def read(self, addr, n):
        i = bisect.bisect_right(self.starts, addr) - 1
        if i < 0:
            return None
        a, l, fo = self.runs[i]
        if addr + n > a + l:
            return None
        return self.m[fo + addr - a: fo + addr - a + n]

    def find_all(self, pat):
        out = []
        for a, l, fo in self.runs:
            i = self.m.find(pat, fo, fo + l)
            while i != -1:
                out.append(a + i - fo)
                i = self.m.find(pat, i + 1, fo + l)
        return out


def tstr(d, a):
    h = d.read(a, 24)
    if h is None:
        return None
    ln = struct.unpack_from('<I', h, 20)[0]
    if not 0 < ln < 4000:
        return None
    b = d.read(a + 24, ln + 1)
    if b is None or b[-1] != 0:
        return None
    try:
        return b[:-1].decode('utf-8')
    except UnicodeDecodeError:
        return None


def value(d, v, tag, depth=0):
    if tag == 6:
        return tstr(d, v)
    if tag == 3:
        return round(struct.unpack('<d', struct.pack('<Q', v))[0], 6)
    if tag == 1:
        return bool(v & 1)
    if tag == 7:
        return walk(d, v, depth + 1) if depth < 6 else '<table>'
    return None if tag == 0 else f'<tag {tag}>'


def walk(d, t, depth=0):
    """Decode a Luau table into a dict (array part keyed 1..n)."""
    h = d.read(t, 48)
    if not h or h[1] != 7:
        return None
    ls, mask = h[4], h[7]
    sizearray = struct.unpack_from('<i', h, 8)[0]
    node = struct.unpack_from('<Q', h, 24)[0]
    arr = struct.unpack_from('<Q', h, 40)[0]
    out = {}
    if arr and 0 < sizearray < 1000:
        for i in range(sizearray):
            b = d.read(arr + 16 * i, 16)
            if b is None:
                break
            v, _, tag = struct.unpack('<QII', b)
            if tag:
                out[i + 1] = value(d, v, tag, depth)
    if ls < 20 and mask == ((1 << ls) - 1) & 0xff:
        nb = d.read(node, 32 << ls)
        for j in range(1 << ls if nb else 0):
            vv, _, vtag, kv, _, kw = struct.unpack_from('<QIIQII', nb, 32 * j)
            if kw & 15 == 0 or vtag == 0:
                continue
            key = value(d, kv, kw & 15, 99)
            if key is not None:
                out[key] = value(d, vv, vtag, depth)
    return out


_HDR = re.compile(rb'(?s).\x07..[\x00-\x17]..')


def table_keys(d, t):
    """String keys of the table at t (hash part only), or None if t is not a table."""
    h = d.read(t, 48)
    if not h or h[1] != 7:
        return None
    ls, mask = h[4], h[7]
    if mask != ((1 << ls) - 1) & 0xff:
        return None
    nb = d.read(struct.unpack_from('<Q', h, 24)[0], 32 << ls)
    if nb is None:
        return None
    keys = {}
    for j in range(1 << ls):
        vv, _, vtag, kv, _, kw = struct.unpack_from('<QIIQII', nb, 32 * j)
        if kw & 15 == 6:
            s = tstr(d, kv)
            if s is None:
                return None
            keys[s] = (vv, vtag)
    return keys


def iter_tables(d):
    """Yield (address, {key: (value, tag)}) for every table with string keys."""
    for a, l, fo in d.runs:
        for mt in _HDR.finditer(d.m, fo, max(fo, fo + l - 48)):
            if (mt.start() - fo) & 7:
                continue
            t = a + mt.start() - fo
            k = table_keys(d, t)
            if k:
                yield t, k
