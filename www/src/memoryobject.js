(function($B) {

var _b_ = $B.builtins

/* memory_iterator start */
$B.memory_iterator.tp_iter = function(self) {
    return self
}

$B.memory_iterator.tp_iternext = function*(self){
    for (var item of self.it) {
        yield item
    }
}

var memory_iterator_funcs = $B.memory_iterator.tp_funcs = {}

/* memory_iterator end */

var memoryview = _b_.memoryview

memoryview.$factory = function(obj) {
    $B.check_nb_args_no_kw('memoryview', 1, arguments)
    if ($B.get_class(obj) === memoryview) {
        return obj
    }
    // Was `search_slot(cls, 'tp_getbuffer', ...)` — the slot is called
    // `bf_getbuffer` in Brython's wrapper_methods table; `tp_getbuffer`
    // never matched anything → every `memoryview(x)` raised TypeError
    // unless `x` was already a memoryview. Now: accept any object whose
    // type exposes the buffer protocol (PEP 688 `__buffer__`, the
    // `bf_getbuffer` slot, or the `$buffer_protocol = true` marker that
    // Brython-native types set on themselves).
    if (! $B.is_buffer(obj)) {
        // PEP 688: no native buffer, delegate to __buffer__
        var buffer_meth = $B.$getattr(obj, '__buffer__', $B.NULL)
        if (buffer_meth !== $B.NULL) {
            var mv = $B.$call(buffer_meth, 0)
            if ($B.get_class(mv) !== memoryview) {
                $B.RAISE(_b_.TypeError,
                    `__buffer__ should return memoryview, not ${$B.class_name(mv)}`)
            }
            return mv
        }
        $B.RAISE(_b_.TypeError, "memoryview: a bytes-like object " +
            "is required, not '" + $B.class_name(obj) + "'"
        )
    }
    obj.exports = obj.exports ?? 0
    obj.exports++ // used to prevent resizing
    var res = {
        ob_type: memoryview,
        obj: obj,
        mbuf: null,
        format: 'B',
        itemsize: 1,
        ndim: 1,
        shape: _b_.tuple.$factory([_b_.len(obj)]),
        strides: _b_.tuple.$factory([1]),
        suboffsets: _b_.tuple.$factory([]),
        c_contiguous: true,
        f_contiguous: true,
        contiguous: true
    }
    return res
}

memoryview.$match_sequence_pattern = true, // for Pattern Matching (PEP 634)
memoryview.$buffer_protocol = true
memoryview.$not_basetype = true // cannot be a base class
memoryview.$is_sequence = true

// Where a view's item starts in its buffer, in bytes. A view of a whole
// buffer reads item k at k * itemsize; a slice keeps the same buffer and reads
// item k at `offset + k * stride`, a negative stride walking it backwards, so
// `memoryview(source)[1:]` reads and writes `source` itself.
function item_start(self, k) {
    return self.slice === undefined ? k * self.itemsize :
        self.slice.offset + k * self.slice.stride
}

// The part of the buffer a slice of a view reads, without making a view
function slice_of(self, key) {
    var s = _b_.slice.$conv_for_seq(key, _b_.memoryview.mp_length(self)),
        step = Number(s.step),
        count = step > 0 ?
            Math.max(0, Math.ceil((s.stop - s.start) / step)) :
            Math.max(0, Math.ceil((s.start - s.stop) / -step)),
        stride = (self.slice === undefined ? self.itemsize :
            self.slice.stride) * step
    return {offset: item_start(self, Number(s.start)), stride, length: count}
}

function memoryview_eq(self, other) {
    var other_is_view = $B.get_class(other) === memoryview
    if (self.slice !== undefined || (other_is_view && other.slice !== undefined)) {
        // A slice is equal to what has its items
        var theirs = other_is_view ? memoryview_funcs.tolist(other) :
            $B.$list(Array.from(_b_.bytes.$factory(other).source))
        return $B.rich_comp('__eq__', memoryview_funcs.tolist(self), theirs)
    }
    var other_obj = other_is_view ? other.obj : other
    var eq = $B.$getattr($B.get_class(self.obj), '__eq__')
    return $B.$call(eq, self.obj, other_obj) === true
}

var struct_format = {
    'x': {'size': 1},
    'b': {'size': 1},
    'B': {'size': 1},
    'c': {'size': 1},
    's': {'size': 1},
    'p': {'size': 1},
    'h': {'size': 2},
    'H': {'size': 2},
    'i': {'size': 4},
    'I': {'size': 4},
    'l': {'size': 4},
    'L': {'size': 4},
    'q': {'size': 8},
    'Q': {'size': 8},
    'f': {'float': true, 'size': 4},
    'd': {'float': true, 'size': 8},
    'P': {'size': 8}
}

// Format of a memoryview item -> DataView reader
var dataview_getter = {
    'b': 'getInt8', 'B': 'getUint8', 'c': 'getUint8', 's': 'getUint8',
    'p': 'getUint8', 'x': 'getUint8',
    'h': 'getInt16', 'H': 'getUint16',
    'i': 'getInt32', 'I': 'getUint32', 'l': 'getInt32', 'L': 'getUint32',
    'q': 'getBigInt64', 'Q': 'getBigUint64', 'P': 'getBigUint64',
    'f': 'getFloat32', 'd': 'getFloat64'
}

const MEMORYVIEW = {
    RELEASED:    0x001,  /* access to master buffer blocked */
    C:           0x002,  /* C-contiguous layout */
    FORTRAN:     0x004,  /* Fortran contiguous layout */
    SCALAR:      0x008,  /* scalar: ndim = 0 */
    PIL:         0x010,  /* PIL-style layout */
    RESTRICTED:  0x020  /* Disallow new references to the memoryview's buffer */
}

/* memoryview start */

memoryview.tp_dealloc = function(self) {
    if (! self.$released) {
        memoryview.tp_funcs.release(self)
    }
}

_b_.memoryview.tp_richcompare = function(self, other, op) {
    if (! $B.$isinstance(other, [_b_.memoryview, _b_.bytes, _b_.bytearray])) {
        return _b_.NotImplemented
    }
    var res
    switch (op) {
        case '__eq__':
            res = memoryview_eq(self, other)
            break
        case '__ne__':
            res = ! memoryview_eq(self, other)
            break
        default:
            res = _b_.NotImplemented
            break
    }
    return res
}

// The position of item `key` in the view, counted from the end when negative
function item_index(self, key) {
    var nb_items = _b_.memoryview.mp_length(self)
    key = $B.PyNumber_Index(key)
    if (key < 0) {
        key += nb_items
    }
    if (key < 0 || key >= nb_items) {
        $B.RAISE(_b_.IndexError, "index out of bounds on dimension 1")
    }
    return key
}

_b_.memoryview.sq_ass_item = function(self, key, value) {
    // A slice writes the items of the buffer it reads
    if ($B.is_bytes(self.obj)) {
        $B.RAISE(_b_.TypeError, "cannot modify read-only memory")
    }
    if (self.slice !== undefined && self.itemsize != 1) {
        $B.RAISE(_b_.NotImplementedError,
            `memoryview: assignment to a slice of format '${self.format}'`)
    }
    if (self.slice !== undefined && $B.get_class(key) === _b_.slice) {
        var target = slice_of(self, key),
            values = _b_.bytes.$factory(value).source
        if (values.length != target.length) {
            $B.RAISE(_b_.ValueError, "memoryview assignment: lvalue " +
                "and rvalue have different structures")
        }
        for (var k = 0; k < target.length; k++) {
            $B.$setitem(self.obj, target.offset + k * target.stride, values[k])
        }
        return
    }
    if ($B.is_int(key)) {
        key = item_index(self, key)
        if (self.format == 'B' && $B.is_int(value)) {
            value = $B.PyNumber_Index(value)
            if (value < 0 || value > 255) {
                $B.RAISE(_b_.ValueError,
                    "memoryview: invalid value for format 'B'")
            }
        }
        if (self.slice !== undefined) {
            key = item_start(self, key)
        }
    }
    $B.$setitem(self.obj, key, value)
}

_b_.memoryview.tp_repr = function(self) {
    if (self.flags & MEMORYVIEW.RELEASED) {
        return "<released memory>"
    } else {
        return "<memory>"
    }
}

_b_.memoryview.tp_hash = function(self) {
    $B.RAISE(_b_.NotImplementedError, '__hash__')
}

_b_.memoryview.tp_iter = function(self) {
    // A slice yields its own items, read as the walk reaches them
    var items = function*() {
        for (var k = 0; k < _b_.memoryview.mp_length(self); k++) {
            yield _b_.memoryview.mp_subscript(self, k)
        }
    }
    return {
        ob_type: $B.memory_iterator,
        it: self.slice === undefined ? $B.make_js_iterator(self.obj) : items()
    }
}

_b_.memoryview.tp_new = function(cls, args, kw) {
    return memoryview.$factory.apply(null, args)
}


_b_.memoryview.mp_length = function(self) {
    return self.slice === undefined ? _b_.len(self.obj) / self.itemsize :
        self.slice.length
}

_b_.memoryview.mp_subscript = function(self, key) {
    var res
    if ($B.is_int(key)) {
        key = item_index(self, key)
        var start = item_start(self, key)
        var view = new DataView(
            Uint8Array.from(self.obj.source.slice(start,
                start + self.itemsize)).buffer)
        res = view[dataview_getter[self.format]](0, true) // little-endian
        return typeof res == 'bigint' ? _b_.int.$int_or_long(res) :
            struct_format[self.format].float ? $B.fast_float(res) : res
    }
    if ($B.get_class(key) === _b_.slice) {
        // A view of the same buffer, its own items picked out of it. A
        // stepped slice (mv[::2], mv[::-1]) of more than one item is not
        // contiguous, which struct.pack_into, for one, reads
        var mv = memoryview.$factory(self.obj)
        mv.format = self.format
        mv.itemsize = self.itemsize
        mv.slice = slice_of(self, key)
        mv.shape = _b_.tuple.$factory([mv.slice.length])
        mv.strides = _b_.tuple.$factory([mv.slice.stride])
        mv.c_contiguous = mv.f_contiguous = mv.contiguous =
            mv.slice.stride == self.itemsize || mv.slice.length <= 1
        return mv
    }
    var getitem = $B.$getattr($B.get_class(self.obj), '__getitem__', $B.NULL)
    if (getitem !== $B.NULL) {
        res = $B.$call(getitem, self.obj, key)
    }
}

_b_.memoryview.bf_getbuffer = function(self) {
    self.exports++
    return self
}

_b_.memoryview.bf_releasebuffer = function(self) {
    self.exports--
}

var memoryview_funcs = _b_.memoryview.tp_funcs = {}

memoryview_funcs.__class_getitem__ = function() {
    return $B.$class_getitem.apply(null, arguments)
}

memoryview_funcs.__enter__ = function(self) {
    return self
}

memoryview_funcs.__exit__ = function(self) {
    memoryview.tp_funcs.release(self)
}

memoryview_funcs._from_flags = function(self) {

}

memoryview_funcs.c_contiguous_get = function(self) {
    return self.c_contiguous
}

memoryview_funcs.c_contiguous_set = _b_.None

memoryview_funcs.cast = function(self, format, shape) {
    if (self.slice !== undefined && ! self.c_contiguous) {
        $B.RAISE(_b_.TypeError,
            "memoryview: casts are restricted to C-contiguous views")
    }
    if (! struct_format.hasOwnProperty(format)) {
        $B.RAISE(_b_.ValueError, `unknown format: '${format}'`)
    }
    var new_itemsize = struct_format[format].size
    if (shape === undefined) {
        shape = _b_.len(self) // new_itemsize
    } else {
        if (! $B.$isinstance(shape, [_b_.list, _b_.tuple])) {
            $B.RAISE(_b_.TypeError, 'shape must be a list or a tuple')
        }
        var nb = 1
        for (var item of shape) {
            if (! $B.is_int(item)) {
                $B.RAISE(_b_.TypeError,
                    'memoryview.cast(): elements of shape must be integers')
            }
            nb *= item
        }
        if (nb * new_itemsize != _b_.len(self)) {
            $B.RAISE(_b_.TypeError,
                'memoryview: product(shape) * itemsize != buffer size')
        }
    }
    var nbytes = self.slice === undefined ? _b_.len(self.obj) :
        self.slice.length * self.itemsize
    if (nbytes % new_itemsize != 0) {
        $B.RAISE(_b_.TypeError, "memoryview: length is not " +
            "a multiple of itemsize")
    }
    var res = memoryview.$factory(self.obj)
    res.format = format
    res.itemsize = new_itemsize
    if (self.slice !== undefined) {
        // The cast of a slice reads the same bytes of the buffer
        res.slice = {offset: self.slice.offset, stride: new_itemsize,
            length: nbytes / new_itemsize}
        res.shape = _b_.tuple.$factory([res.slice.length])
        res.strides = _b_.tuple.$factory([new_itemsize])
    }
    return res
}

memoryview_funcs.contiguous_get = function(self) {
    return self.contiguous
}

memoryview_funcs.contiguous_set = _b_.None

memoryview_funcs.count = function(self) {
    var $ = $B.args('count', 2, {self: null, value: null}, arguments)
    var self = $.self,
        value = $.value
    var iter = _b_.memoryview.tp_iter(self)
    var count = 0
    for (var item of $B.make_js_iterator(iter)) {
        if ($B.is_or_equals(item, value)) {
            count++
        }
    }
    return count
}

memoryview_funcs.f_contiguous_get = function(self) {
    return self.f_contiguous
}

memoryview_funcs.f_contiguous_set = _b_.None

memoryview_funcs.format_get = function(self) {
    return self.format
}

memoryview_funcs.format_set = _b_.None

memoryview_funcs.hex = function(self) {
    var res = '',
        bytes = _b_.bytes.$factory(self)
    for (let item of bytes.source) {
        res += item.toString(16)
    }
    return res
}

memoryview_funcs.index = function(self) {
    var $ = $B.args('index', 4,
                {self: null, value: null, start: null, stop: null},
                arguments, {start: 0, stop: $B.max_int})
    var self = $.self,
        value = $.value,
        start = $.start,
        stop = $.stop
    if (self.ndim == 0) {
        $B.RAISE(_b_.TypeError, "invalid lookup on 0-dim memory")
    }
    if (self.ndim == 1) {
        var n = self.shape[0]
        if (start < 0) {
            start = Math.max(start + n, 0)
        }
        if (stop < 0) {
            stop = Math.max(stop + n, 0)
        }
        stop = Math.min(stop, n)
        start = Math.min(start, stop)
        for (let index = start; index < stop; index++) {
            var item = _b_.memoryview.mp_subscript(self, index)
            if ($B.is_or_equals(item, value)) {
                return index
            }
        }
        $B.RAISE(_b_.ValueError, "memoryview.index(x): x not found")
    }
    $B.RAISE(_b_.NotImplementedError,
        "multi-dimensional lookup is not implemented"
    )
}

memoryview_funcs.itemsize_get = function(self) {
    return self.itemsize
}

memoryview_funcs.itemsize_set = _b_.None

memoryview_funcs.nbytes_get = function(self) {
    var product = 1
    for (var x of self.shape) {
        product *= x
    }
    // factory stores itemsize 1 even over a multi-byte buffer (e.g. array('Q')):
    // fall back to the source object's real itemsize so nbytes is the byte length
    var isize = self.itemsize
    if (isize === 1) {
        var src = $B.$getattr(self.obj, 'itemsize', null)
        if (src !== null && $B.is_int(src)) {
            isize = src
        }
    }
    return product * isize
}

memoryview_funcs.nbytes_set = _b_.None

memoryview_funcs.ndim_get = function(self) {
    return self.ndim
}

memoryview_funcs.ndim_set = _b_.None

memoryview_funcs.obj_get = function(self) {
    return self.obj
}

memoryview_funcs.obj_set = _b_.None

memoryview_funcs.readonly_get = function(self) {
    return $B.is_bytes(self.obj)
}

memoryview_funcs.readonly_set = _b_.None

memoryview_funcs.release = function(self) {
    if (self.$released) {
        return
    }
    self.$released = true
    self.obj.exports -= 1
}

memoryview_funcs.shape_get = function(self) {
    return self.shape
}

memoryview_funcs.shape_set = _b_.None

memoryview_funcs.strides_get = function(self) {
    return self.strides
}

memoryview_funcs.strides_set = _b_.None

memoryview_funcs.suboffsets_get = function(self) {
    return self.suboffsets
}

memoryview_funcs.suboffsets_set = _b_.None

function buffer_bytes(obj) {
    if ($B.$isinstance(obj, [_b_.bytes, _b_.bytearray])) {
        return {
            ob_type: _b_.bytes,
            source: obj.source
        }
    } else if ($B.imported.array) {
        var array = $B.module_getattr($B.imported.array, 'array')
        if ($B.$isinstance(obj, array)) {
            // Was `array.tobytes(self.obj)` — methods live in tp_funcs,
            // not as direct JS properties (finalize_type installs them
            // in tp_dict as method_descriptors).
            return array.tp_funcs.tobytes(obj)
        }
    }
    $B.RAISE(_b_.TypeError, 'cannot run tobytes with ' + $B.class_name(obj))
}

memoryview_funcs.tobytes = function(self) {
    var whole = buffer_bytes(self.obj)
    if (self.slice === undefined) {
        return whole
    }
    // A slice's bytes, item by item
    var source = []
    for (var k = 0; k < self.slice.length; k++) {
        var start = item_start(self, k)
        source.push(...whole.source.slice(start, start + self.itemsize))
    }
    return {ob_type: _b_.bytes, source}
}

memoryview_funcs.tolist = function(self) {
    var res = []
    for (var i = 0, len = _b_.memoryview.mp_length(self); i < len; i++) {
        res.push(_b_.memoryview.mp_subscript(self, i))
    }
    return $B.$list(res)
}

memoryview_funcs.toreadonly = function(self) {
    // return a new read-only view; the original stays writable (it mutated
    // self and returned None, so memoryview(b).toreadonly() was unusable)
    var res = memoryview.$factory(self.obj)
    for (var field of ['format', 'itemsize', 'slice', 'shape', 'strides',
                       'c_contiguous', 'f_contiguous', 'contiguous']) {
        res[field] = self[field]
    }
    res.readonly = 1
    return res
}

_b_.memoryview.tp_methods = ["release", "tobytes", "hex", "tolist", "cast", "toreadonly", "count", "index", "__enter__", "__exit__"]

_b_.memoryview.classmethods = ["_from_flags", "__class_getitem__"]

_b_.memoryview.tp_getset = ["obj", "nbytes", "readonly", "itemsize", "format", "ndim", "shape", "strides", "suboffsets", "c_contiguous", "f_contiguous", "contiguous"]

/* memoryview end */

$B.set_func_names(memoryview, "builtins")

})(__BRYTHON__)