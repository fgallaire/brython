import io
import traceback
import re
import sys

from tester import assert_raises

src = """def f():
  f()

f()"""

expected = """  File "<string>", line 4, in <module>
  File "<string>", line 2, in f
  File "<string>", line 2, in f
  File "<string>", line 2, in f"""

try:
    exec(src)
except RecursionError as exc:
    out = io.StringIO()
    traceback.print_exc(file=out)
    trace = out.getvalue()
    assert expected in trace
    assert re.search(r"[Previous line repeated \d+ more times]", trace)
    assert "RecursionError: maximum recursion depth exceeded" in trace

src = """x = 0

def f():
    global x
    x += 1
    if x < 10:
        f()
    1 / 0
f()"""

expected = """  File "<string>", line 9, in <module>
  File "<string>", line 7, in f
  File "<string>", line 7, in f
  File "<string>", line 7, in f
  [Previous line repeated 6 more times]
  File "<string>", line 8, in f
ZeroDivisionError: division by zero"""

try:
    exec(src)
except ZeroDivisionError as exc:
    out = io.StringIO()
    traceback.print_exc(file=out)
    trace = out.getvalue()
    assert expected in trace

# PEP 654 (Exception Groups and except*)

assert_raises(TypeError,
    ExceptionGroup,
    'issues',
    [ValueError('bad value'), BaseException('base')],
    msg = 'Cannot nest BaseExceptions in an ExceptionGroup')

e = BaseExceptionGroup('issues',
        [ValueError('bad value'), TypeError('bad type')])
assert type(e) is ExceptionGroup

source = "def myfunc():\n error"
code = compile(source, 'foo.py', 'exec')
exec(code)
expected = """File "foo.py", line 2, in myfunc"""

try:
    myfunc()
except NameError as exc:
    import traceback
    import io
    out = io.StringIO()
    traceback.print_exc(file=out)
    assert expected in out.getvalue()


import io

eg = BaseExceptionGroup(
    "one",
    [
        BaseException(1),
        ExceptionGroup(
            "two",
             [TypeError(2), ValueError(3)]
        ),
        ExceptionGroup(
             "three",
              [OSError(4)]
        )
    ]
)

def normalize(multiline):
    """Set line ends to \n"""
    multiline = multiline.replace('\r\n', '\n')
    multiline = multiline.replace('\r', '\n')
    return multiline

import traceback

out = io.StringIO()
traceback.print_exception(eg, file=out)
expected = normalize("""  | BaseExceptionGroup: one (3 sub-exceptions)
  +-+---------------- 1 ----------------
    | BaseException: 1
    +---------------- 2 ----------------
    | ExceptionGroup: two (2 sub-exceptions)
    +-+---------------- 1 ----------------
      | TypeError: 2
      +---------------- 2 ----------------
      | ValueError: 3
      +------------------------------------
    +---------------- 3 ----------------
    | ExceptionGroup: three (1 sub-exception)
    +-+---------------- 1 ----------------
      | OSError: 4
      +------------------------------------
""")
got = normalize(out.getvalue())

assert got == expected

type_errors = eg.subgroup(lambda e: isinstance(e, TypeError))
out = io.StringIO()
expected = normalize("""  | ExceptionGroup: one (1 sub-exception)
  +-+---------------- 1 ----------------
    | ExceptionGroup: two (1 sub-exception)
    +-+---------------- 1 ----------------
      | TypeError: 2
      +------------------------------------
""")
traceback.print_exception(type_errors, file=out)
assert normalize(out.getvalue()) == expected

type_errors, rest = eg.split(lambda e: isinstance(e, TypeError))
out = io.StringIO()
expected = normalize("""  | ExceptionGroup: one (1 sub-exception)
  +-+---------------- 1 ----------------
    | ExceptionGroup: two (1 sub-exception)
    +-+---------------- 1 ----------------
      | TypeError: 2
      +------------------------------------
""")
traceback.print_exception(type_errors, file=out)
assert normalize(out.getvalue()) == expected

out = io.StringIO()
expected = normalize("""  | BaseExceptionGroup: one (3 sub-exceptions)
  +-+---------------- 1 ----------------
    | BaseException: 1
    +---------------- 2 ----------------
    | ExceptionGroup: two (1 sub-exception)
    +-+---------------- 1 ----------------
      | ValueError: 3
      +------------------------------------
    +---------------- 3 ----------------
    | ExceptionGroup: three (1 sub-exception)
    +-+---------------- 1 ----------------
      | OSError: 4
      +------------------------------------
""")
traceback.print_exception(rest, file=out)
assert normalize(out.getvalue()) == expected

def f(src):
    s = []
    try:
        exec(src)
    except * TypeError:
        ...
    except* ValueError as e:
        ...
    except*  (ZeroDivisionError, FileNotFoundError) as e:
        s.append('zero')
    else:
        s.append('no exception')
    finally:
        s.append('end')
    return s

assert f("1 / 0") == ['zero', 'end']
assert f("x = 0") == ['no exception', 'end']

# a group's split() and subgroup()
def shape(exc):
    if exc is None:
        return None
    if isinstance(exc, BaseExceptionGroup):
        return (exc.message, [shape(one) for one in exc.exceptions])
    return repr(exc)

def group():
    return ExceptionGroup("g",
        [ValueError(1), TypeError(2), ExceptionGroup("n", [ValueError(3), KeyError(4)])])

assert [shape(one) for one in group().split(ValueError)] == [
    ('g', ['ValueError(1)', ('n', ['ValueError(3)'])]),
    ('g', ['TypeError(2)', ('n', ['KeyError(4)'])])]
assert [shape(one) for one in group().split((ValueError, KeyError))] == [
    ('g', ['ValueError(1)', ('n', ['ValueError(3)', 'KeyError(4)'])]),
    ('g', ['TypeError(2)'])]
assert shape(group().subgroup(lambda e: isinstance(e, KeyError))) == \
    ('g', [('n', ['KeyError(4)'])])
assert group().subgroup(OSError) is None
g = group()
assert g.split(Exception) == (g, None)
assert_raises(TypeError, g.split, 1)
assert_raises(TypeError, ExceptionGroup, 1, [ValueError()])

g.add_note('note')
match, rest = g.split(ValueError)
assert match.__notes__ == rest.__notes__ == ['note']
assert match.__notes__ is not g.__notes__

class MyGroup(ExceptionGroup):
    def derive(self, excs):
        return MyGroup(self.message, excs)

assert [type(one) for one in MyGroup("m", [ValueError(1), TypeError(2)]).split(ValueError)] \
    == [MyGroup, MyGroup]

# except* runs a handler once, on what it takes of the group
def except_star(raised):
    seen = []
    try:
        try:
            raise raised
        except* ValueError as e:
            seen.append(('value', shape(e)))
            assert sys.exception() is e
        except* (TypeError, KeyError) as e:
            seen.append(('type', shape(e)))
        else:
            seen.append('else')
    except BaseException as escaped:
        seen.append(('escaped', shape(escaped)))
    return seen

assert except_star(group()) == [
    ('value', ('g', ['ValueError(1)', ('n', ['ValueError(3)'])])),
    ('type', ('g', ['TypeError(2)', ('n', ['KeyError(4)'])]))]
assert except_star(ExceptionGroup("g", [ValueError(1), ValueError(2)])) == [
    ('value', ('g', ['ValueError(1)', 'ValueError(2)']))]
assert except_star(ExceptionGroup("g", [ValueError(1), OSError(2)])) == [
    ('value', ('g', ['ValueError(1)'])),
    ('escaped', ('g', ['OSError(2)']))]
# an exception that is no group is wrapped when taken, and left as it is otherwise
assert except_star(ValueError(1)) == [('value', ('', ['ValueError(1)']))]
assert except_star(OSError(1)) == [('escaped', 'OSError(1)')]

g = ExceptionGroup("g", [ValueError(1)])
try:
    raise g
except* Exception as e:
    assert e is g

# the handlers all run, then what they raised is raised, with what remains
def escaping(handlers):
    try:
        handlers()
    except BaseException as escaped:
        return shape(escaped)

def one_raises():
    try:
        raise ExceptionGroup("g", [ValueError(1), KeyError(2)])
    except* ValueError:
        raise OSError("new")

assert escaping(one_raises) == ('', ["OSError('new')", ('g', ['KeyError(2)'])])

def both_raise():
    try:
        raise ExceptionGroup("g", [ValueError(1), TypeError(2)])
    except* ValueError:
        raise OSError("one")
    except* TypeError:
        raise KeyError("two")

assert escaping(both_raise) == ('', ["OSError('one')", "KeyError('two')"])

def reraises():
    try:
        raise ExceptionGroup("g", [ValueError(1), TypeError(2), OSError(3)])
    except* ValueError:
        raise
    except* TypeError:
        pass

assert escaping(reraises) == ('g', ['ValueError(1)', 'OSError(3)'])

def reraises_and_raises():
    try:
        raise ExceptionGroup("g", [ValueError(1), TypeError(2)])
    except* ValueError:
        raise
    except* TypeError:
        raise OSError("new")

assert escaping(reraises_and_raises) == ('', ["OSError('new')", ('g', ['ValueError(1)'])])

def reraises_naked():
    try:
        raise ValueError(1)
    except* ValueError:
        raise

assert escaping(reraises_naked) == ('', ['ValueError(1)'])

# the types of except*
def star_group():
    try:
        raise ValueError(1)
    except* (ValueError, ExceptionGroup):
        pass

assert_raises(TypeError, star_group,
    msg='catching ExceptionGroup with except* is not allowed. Use except instead.')

def star_not_a_type():
    try:
        raise ValueError(1)
    except* 1:
        pass

assert_raises(TypeError, star_not_a_type,
    msg='catching classes that do not inherit from BaseException is not allowed')

# the name is unbound after the handler
def star_name():
    try:
        raise ValueError(1)
    except* ValueError as e:
        pass
    return e

assert_raises(UnboundLocalError, star_name)

jump_error = "'break', 'continue' and 'return' cannot appear in an except* block"
for jump in ["for i in []:\n  try:\n    pass\n  except* ValueError:\n    break\n",
             "for i in []:\n  try:\n    pass\n  except* ValueError:\n    continue\n",
             "def f():\n  try:\n    pass\n  except* ValueError:\n    if 1:\n      return\n"]:
    try:
        compile(jump, 'x', 'exec')
        raise AssertionError('should have raised SyntaxError')
    except SyntaxError as exc:
        assert exc.msg == jump_error

# a loop or a function inside the handler has its own jumps
compile("try:\n  pass\nexcept* ValueError:\n  for i in []:\n    break\n", 'x', 'exec')
compile("try:\n  pass\nexcept* ValueError:\n  def f():\n    return 1\n", 'x', 'exec')

# PEP 678 : Enriching Exceptions with Notes
try:
    1 / 0
except ZeroDivisionError as exc:
    assert_raises(AttributeError, getattr, exc, '__notes__')
    exc.add_note('zero')
    assert exc.__notes__ == ['zero']

# issue 2092
out = io.StringIO()

x = 4
lineno = sys._getframe().f_lineno
try:
    for i in range(3.5):
        pass
except TypeError as exc:
    traceback.print_exc(file=out)
    message = out.getvalue()
    assert f'line {lineno + 2}' in message

# issue 2530
assert IOError is OSError
assert WindowsError is OSError
assert EnvironmentError is OSError

ioerror = IOError()
assert type(ioerror) is OSError

# issue 2540
import exception_traces

# issue 2582
a = {'key': 1}
try:
  a['missing']
except KeyError as e:
  assert str(e) == "'missing'"

# issue 2940 - an exception member that was never set reads as None
assert NameError("boom").name is None
assert AttributeError("nope").name is None
assert AttributeError("nope").obj is None
assert StopIteration().value is None
assert StopIteration(5).value == 5
# a failed lookup still sets it
try:
    undefined_name_2940
except NameError as exc:
    assert exc.name == "undefined_name_2940"
# so the traceback module no longer fails on "name in sys.stdlib_module_names"
try:
    raise NameError("boom")
except NameError:
    assert "NameError: boom" in traceback.format_exc()
# and unittest can record the error, instead of reporting a successful run
import unittest

class Test2940(unittest.TestCase):
    def test_raises_name_error(self):
        raise NameError("boom")

result_2940 = unittest.TestResult()
unittest.TestLoader().loadTestsFromTestCase(Test2940).run(result_2940)
assert len(result_2940.errors) == 1
assert not result_2940.wasSuccessful()

# PR 3092
assert UnicodeEncodeError('utf-8', 'a', 0, 1, 'r').args == \
  ('utf-8', 'a', 0, 1, 'r')

# issue reported in PR 2958
import warnings
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter('ignore')
    warnings.warn('nope')
assert len(w) == 0

print('all tests passed...')