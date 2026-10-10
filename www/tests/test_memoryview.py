b = b'essai'
m = memoryview(b)

assert m[0] == 101
assert m[1:2] == memoryview(b's')
assert m[1:2] != memoryview(b'x')
assert bytes(m[2:4]) == b'sa'

data = bytearray(b'abcefg')
v = memoryview(data)
assert v.tobytes() == b'abcefg'
assert v.hex() == '616263656667'
assert v.format == 'B'
assert v.itemsize == 1
assert v.tolist() == [97, 98, 99, 101, 102, 103]
assert v.shape == (6,)
assert v.strides == (1,)

# a slice is a view of the same buffer, read and written through
source = bytearray(b"abcdef")
view = memoryview(source)
tail, every_other, backwards = view[1:], view[::2], view[::-1]
source[1] = 120
assert tail.obj is source
assert tail.tolist() == [120, 99, 100, 101, 102]
assert list(backwards[1:3]) == [101, 100]
tail[0] = 98
every_other[1] = 67
assert bytes(source) == b"abCdef"
assert bytes(backwards[::2]) == b"fdb" and bytes(every_other[::-1]) == b"eCa"
assert every_other.strides == (2,) and not every_other.c_contiguous
assert view[2:6].cast("I").tolist() == [int.from_bytes(b"Cdef", "little")]
tail[0:2] = b"xy"
assert bytes(source) == b"axydef"

# PR 2787
import array
assert memoryview(array.array('Q', [1, 2, 3, 4, 5])).nbytes == 40

# writing an item: read-only first, then the index, then the value
from tester import assert_raises

source = bytearray(b"abc")
view = memoryview(source)
view[-1] = 120
assert_raises(IndexError, view.__setitem__, 3, 0,
    msg="index out of bounds on dimension 1")
assert_raises(ValueError, view.__setitem__, 0, -1,
    msg="memoryview: invalid value for format 'B'")
assert source == bytearray(b"abx")
assert_raises(TypeError, memoryview(b"abc").__setitem__, 5, 0,
    msg="cannot modify read-only memory")