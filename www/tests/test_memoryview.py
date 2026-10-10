from tester import assert_raises

# a released view refuses every operation and attribute, release() and the
# context manager's exit aside
source = bytearray(b"abc")
with memoryview(source) as view:
    pass
assert view.release() is None
released ="operation forbidden on released memoryview object"
for operation in [len, list, bytes, memoryview, lambda v: v[0],
                  lambda v: v.__setitem__(0, 120), lambda v: v.tobytes(),
                  lambda v: v.tolist(), lambda v: v.hex(), lambda v: v.cast("B"),
                  lambda v: v.toreadonly(), lambda v: v.count(97),
                  lambda v: v.index(97), lambda v: v.__enter__(),
                  lambda v: v.obj, lambda v: v.nbytes, lambda v: v.shape,
                  lambda v: v.readonly, lambda v: v.format]:
    assert_raises(ValueError, operation, view, msg=released)
assert list(source) == [97, 98, 99]

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

# PR 2787
import array
assert memoryview(array.array('Q', [1, 2, 3, 4, 5])).nbytes == 40