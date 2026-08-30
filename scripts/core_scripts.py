core_scripts = [
    'brython_builtins',
    'init_builtin_types',
    'stdlib_paths',
    'unicode_data',
    'version_info',
    'py_tokens',
    'python_tokenizer',
    'loaders',
    'py_utils',
    'py_object',
    'py_type',
    'descriptors',
    'py_functions',
    'py_io',
    'py_builtin_functions',
    'py_code',
    'py_eval_exec',
    'py_sort',
    'py_exceptions',
    'py_range_slice',
    'py_bytes',
    'memoryobject',
    'py_set',
    'py_string',
    'py_int',
    'py_float',
    'py_complex',
    'py_dict',
    'py_list',
    'js_objects',
    'py_generator',
    'py_dom',
    'py_pattern_matching',
    'async',
    'py_import',
    'builtin_modules',
    'py2js',
    'py_ast_classes',
    'py_ast',
    'finalize_builtin_types',
    'ast_to_js',
    'symtable',
    'action_helpers',
    'string_parser',
    'number_parser',
    'python_parser',
    'pegen',
    'gen_parse',
    'brython_ready'


]

# The Python-to-JavaScript parsing chain. A page that only runs code compiled
# ahead of time — precompiled modules in $B.precompiled — never reaches any of
# it, so `make_dist.py --runtime-only` leaves these out.
#
# `python_tokenizer` and `py_tokens` stay: str.isidentifier() and friends call
# $B.is_XID_Start / is_XID_Continue / in_unicode_category. `ast_to_js` stays too,
# because it holds the name resolution the generated code calls at run time.
#
# What is lost: exec(), eval(), compile(), the ast module, importing a .py from
# source, and the caret line of a traceback (PEP 657), which re-parses the source.
compiler_scripts = [
    'symtable',
    'action_helpers',
    'string_parser',
    'number_parser',
    'python_parser',
    'pegen',
    'gen_parse'
]

