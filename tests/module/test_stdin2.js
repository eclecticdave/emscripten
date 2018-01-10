// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;
  if (!Module['rawPrint']) Module['rawPrint'] = function(txt) { process.stdout.write(txt); }
  if (!Module['rawPrintErr']) Module['rawPrintErr'] = function(txt) { process.stderr.write(txt); }

  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    Module['printErr']('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm
  if (!Module['rawPrint']) Module['rawPrint'] = putstr;

  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  } else {
    Module['read'] = function shell_read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function shell_print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function shell_printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('Unknown runtime environment. Where are we?');
}

if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}
if (!Module['quit']) {
  Module['quit'] = function(status, toThrow) {
    throw toThrow;
  }
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}



var functionPointers = new Array(0);

function addFunction(func) {
  for (var i = 0; i < functionPointers.length; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return 2*(1 + i);
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[(index-2)/2] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;






// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 6384;
/* global initializers */  __ATINIT__.push();


memoryInitializer = "data:application/octet-stream;base64,DAAAAAkAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAADAAAA3BAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMAAAABQAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAMAAADkFAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwBAAAFAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAwAAAOwUAAAABAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAK/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAEAAAIAAMADAADABAAAwAUAAMAGAADABwAAwAgAAMAJAADACgAAwAsAAMAMAADADQAAwA4AAMAPAADAEAAAwBEAAMASAADAEwAAwBQAAMAVAADAFgAAwBcAAMAYAADAGQAAwBoAAMAbAADAHAAAwB0AAMAeAADAHwAAwAAAALMBAADDAgAAwwMAAMMEAADDBQAAwwYAAMMHAADDCAAAwwkAAMMKAADDCwAAwwwAAMMNAADTDgAAww8AAMMAAAy7AQAMwwIADMMDAAzDBAAM0wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAZAAAAOgDAAAQJwAAoIYBAEBCDwCAlpgAAOH1BV9wiQD/CS8PRW50ZXIgeW91ciBuYW1lOiAAJXMASGVsbG8gJXMuCgBXaGF0IGlzIHlvdXIgZmF2b3VyaXRlIGNvbG91cj8gACVzIGlzIGEgZ3JlYXQgY29sb3VyIQoARG8geW91IHdhbnQgYW5vdGhlciBnbz8gAHllcwBZZXMAWUVTAAoAR29vZGJ5ZSwgJXMuCgARAAoAERERAAAAAAUAAAAAAAAJAAAAAAsAAAAAAAAAABEADwoREREDCgcAARMJCwsAAAkGCwAACwAGEQAAABEREQAAAAAAAAAAAAAAAAAAAAALAAAAAAAAAAARAAoKERERAAoAAAIACQsAAAAJAAsAAAsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAA0AAAAEDQAAAAAJDgAAAAAADgAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAPAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgAAABISEgAAAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsAAAAAAAAAAAAAAAoAAAAACgAAAAAJCwAAAAAACwAACwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAMAAAAAAwAAAAACQwAAAAAAAwAAAwAAC0rICAgMFgweAAobnVsbCkALTBYKzBYIDBYLTB4KzB4IDB4AGluZgBJTkYATkFOADAxMjM0NTY3ODlBQkNERUYuAFQhIhkNAQIDEUscDBAECx0SHidobm9wcWIgBQYPExQVGggWBygkFxgJCg4bHyUjg4J9JiorPD0+P0NHSk1YWVpbXF1eX2BhY2RlZmdpamtscnN0eXp7fABJbGxlZ2FsIGJ5dGUgc2VxdWVuY2UARG9tYWluIGVycm9yAFJlc3VsdCBub3QgcmVwcmVzZW50YWJsZQBOb3QgYSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbgAAaW5maW5pdHkAbmFuAP////////////////////////////////////////////////////////////////8AAQIDBAUGBwgJ/////////woLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIj////////CgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiP/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////AAECBAcDBgU=";





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___lock() {}

  
    

  
  
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var PATH={splitPath:function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function (parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function (path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function (path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function (path) {
        return PATH.splitPath(path)[3];
      },join:function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function (l, r) {
        return PATH.normalize(l + '/' + r);
      },resolve:function () {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? arguments[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path !== 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
          return !!p;
        }), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },relative:function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      }};
  
  var TTY={ttys:[],init:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process['stdin']['setEncoding']('utf8');
        // }
      },shutdown:function () {
        // https://github.com/kripken/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process['stdin']['pause']();
        // }
      },register:function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },stream_ops:{open:function (stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          stream.tty = tty;
          stream.seekable = false;
        },close:function (stream) {
          // flush any pending line data
          stream.tty.ops.flush(stream.tty);
        },flush:function (stream) {
          stream.tty.ops.flush(stream.tty);
        },read:function (stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
  
            // If EOL character, return having put it in the buffer.
            if (result === 10) break;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },write:function (stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          for (var i = 0; i < length; i++) {
            try {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
          }
          // Sending null causes output to be printed, even if it didn't end in a
          // newline.
          stream.tty.ops.put_char(stream.tty, null);
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }},default_tty_ops:{get_char:function (tty) {
          if (!tty.input.length) {
            var result = null;
            if (ENVIRONMENT_IS_NODE) {
              // we will read data by chunks of BUFSIZE
              var BUFSIZE = 256;
              var buf = new Buffer(BUFSIZE);
              var bytesRead = 0;
  
              var isPosixPlatform = (process.platform != 'win32'); // Node doesn't offer a direct check, so test by exclusion
  
              var fd = process.stdin.fd;
              if (isPosixPlatform) {
                // Linux and Mac cannot use process.stdin.fd (which isn't set up as sync)
                var usingDevice = false;
                try {
                  fd = fs.openSync('/dev/stdin', 'r');
                  usingDevice = true;
                } catch (e) {}
              }
  
              try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
              } catch(e) {
                // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
                // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
                if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
                else throw e;
              }
  
              if (usingDevice) { fs.closeSync(fd); }
              if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString('utf-8');
              } else {
                result = null;
              }
  
            } else if (typeof window != 'undefined' &&
              typeof window.prompt == 'function') {
              // Browser.
              result = window.prompt('Input: ');  // returns null on cancel
              if (result !== null) {
                result += '\n';
              }
            } else if (typeof readline == 'function') {
              // Command line.
              result = readline();
              if (result !== null) {
                result += '\n';
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        },put_char:function (tty, val) {
          if (val === 10) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else if (val === null && tty.output.length && Module['rawPrint'] != undefined) {
            Module['rawPrint'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else if (val !== null && val != 0) {
            tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['print'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }},default_tty1_ops:{put_char:function (tty, val) {
          if (val === 10) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else if (val === null && tty.output.length && Module['rawPrintErr'] != undefined) {
            Module['rawPrintErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];          
          } else if (val !== null && val != 0) {
            tty.output.push(val);
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            Module['printErr'](UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }}};
  
  var MEMFS={ops_table:null,mount:function (mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },createNode:function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },getFileDataAsRegularArray:function (node) {
        if (node.contents && node.contents.subarray) {
          var arr = [];
          for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
          return arr; // Returns a copy of the original data.
        }
        return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
      },getFileDataAsTypedArray:function (node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },expandFileStorage:function (node, newCapacity) {
        // If we are asked to expand the size of a file that already exists, revert to using a standard JS array to store the file
        // instead of a typed array. This makes resizing the array more flexible because we can just .push() elements at the back to
        // increase the size.
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
          node.contents = MEMFS.getFileDataAsRegularArray(node);
          node.usedBytes = node.contents.length; // We might be writing to a lazy-loaded file which had overridden this property, so force-reset it.
        }
  
        if (!node.contents || node.contents.subarray) { // Keep using a typed array if creating a new storage, or if old one was a typed array as well.
          var prevCapacity = node.contents ? node.contents.length : 0;
          if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
          // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
          // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
          // avoid overshooting the allocation cap by a very large margin.
          var CAPACITY_DOUBLING_MAX = 1024 * 1024;
          newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
          if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
          var oldContents = node.contents;
          node.contents = new Uint8Array(newCapacity); // Allocate new storage.
          if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
          return;
        }
        // Not using a typed array to back the file storage. Use a standard JS array instead.
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0);
      },resizeFileStorage:function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
          return;
        }
        if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
          var oldContents = node.contents;
          node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
          return;
        }
        // Backing with a JS array.
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
      },node_ops:{getattr:function (node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },lookup:function (parent, name) {
          throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },mknod:function (parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },rename:function (old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          old_node.parent = new_dir;
        },unlink:function (parent, name) {
          delete parent.contents[name];
        },rmdir:function (parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
          delete parent.contents[name];
        },readdir:function (node) {
          var entries = ['.', '..']
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },readlink:function (node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return node.link;
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },write:function (stream, buffer, offset, length, position, canOwn) {
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
          else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position+length);
          return length;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        },allocate:function (stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },mmap:function (stream, buffer, offset, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if ( !(flags & 2) &&
                (contents.buffer === buffer || contents.buffer === buffer.buffer) ) {
            // We can't emulate MAP_SHARED when the file is not backed by the buffer
            // we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < stream.node.usedBytes) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = _malloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
            }
            buffer.set(contents, ptr);
          }
          return { ptr: ptr, allocated: allocated };
        },msync:function (stream, buffer, offset, length, mmapFlags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          if (mmapFlags & 2) {
            // MAP_PRIVATE calls need not to be synced back to underlying fs
            return 0;
          }
  
          var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        }}};
  
  var IDBFS={dbs:{},indexedDB:function () {
        if (typeof indexedDB !== 'undefined') return indexedDB;
        var ret = null;
        if (typeof window === 'object') ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, 'IDBFS used, but indexedDB not supported');
        return ret;
      },DB_VERSION:21,DB_STORE_NAME:"FILE_DATA",mount:function (mount) {
        // reuse all of the core MEMFS functionality
        return MEMFS.mount.apply(null, arguments);
      },syncfs:function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
          if (err) return callback(err);
  
          IDBFS.getRemoteSet(mount, function(err, remote) {
            if (err) return callback(err);
  
            var src = populate ? remote : local;
            var dst = populate ? local : remote;
  
            IDBFS.reconcile(src, dst, callback);
          });
        });
      },getDB:function (name, callback) {
        // check the cache first
        var db = IDBFS.dbs[name];
        if (db) {
          return callback(null, db);
        }
  
        var req;
        try {
          req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
          return callback(e);
        }
        if (!req) {
          return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          var transaction = e.target.transaction;
  
          var fileStore;
  
          if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
            fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
          } else {
            fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
          }
  
          if (!fileStore.indexNames.contains('timestamp')) {
            fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function() {
          db = req.result;
  
          // add to the cache
          IDBFS.dbs[name] = db;
          callback(null, db);
        };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },getLocalSet:function (mount, callback) {
        var entries = {};
  
        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return function(p) {
            return PATH.join2(root, p);
          }
        };
  
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  
        while (check.length) {
          var path = check.pop();
          var stat;
  
          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
  
          if (FS.isDir(stat.mode)) {
            check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }
  
          entries[path] = { timestamp: stat.mtime };
        }
  
        return callback(null, { type: 'local', entries: entries });
      },getRemoteSet:function (mount, callback) {
        var entries = {};
  
        IDBFS.getDB(mount.mountpoint, function(err, db) {
          if (err) return callback(err);
  
          try {
            var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
            transaction.onerror = function(e) {
              callback(this.error);
              e.preventDefault();
            };
  
            var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
            var index = store.index('timestamp');
  
            index.openKeyCursor().onsuccess = function(event) {
              var cursor = event.target.result;
  
              if (!cursor) {
                return callback(null, { type: 'remote', db: db, entries: entries });
              }
  
              entries[cursor.primaryKey] = { timestamp: cursor.key };
  
              cursor.continue();
            };
          } catch (e) {
            return callback(e);
          }
        });
      },loadLocalEntry:function (path, callback) {
        var stat, node;
  
        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
  
        if (FS.isDir(stat.mode)) {
          return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
          // Performance consideration: storing a normal JavaScript array to a IndexedDB is much slower than storing a typed array.
          // Therefore always convert the file contents to a typed array first before writing the data to IndexedDB.
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },storeLocalEntry:function (path, entry, callback) {
        try {
          if (FS.isDir(entry.mode)) {
            FS.mkdir(path, entry.mode);
          } else if (FS.isFile(entry.mode)) {
            FS.writeFile(path, entry.contents, { canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }
  
          FS.chmod(path, entry.mode);
          FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },removeLocalEntry:function (path, callback) {
        try {
          var lookup = FS.lookupPath(path);
          var stat = FS.stat(path);
  
          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },loadRemoteEntry:function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) { callback(null, event.target.result); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },storeRemoteEntry:function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },removeRemoteEntry:function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },reconcile:function (src, dst, callback) {
        var total = 0;
  
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
          var e = src.entries[key];
          var e2 = dst.entries[key];
          if (!e2 || e.timestamp > e2.timestamp) {
            create.push(key);
            total++;
          }
        });
  
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
          var e = dst.entries[key];
          var e2 = src.entries[key];
          if (!e2) {
            remove.push(key);
            total++;
          }
        });
  
        if (!total) {
          return callback(null);
        }
  
        var errored = false;
        var completed = 0;
        var db = src.type === 'remote' ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return callback(err);
            }
            return;
          }
          if (++completed >= total) {
            return callback(null);
          }
        };
  
        transaction.onerror = function(e) {
          done(this.error);
          e.preventDefault();
        };
  
        // sort paths in ascending order so directory entries are created
        // before the files inside them
        create.sort().forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.loadRemoteEntry(store, path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeLocalEntry(path, entry, done);
            });
          } else {
            IDBFS.loadLocalEntry(path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeRemoteEntry(store, path, entry, done);
            });
          }
        });
  
        // sort paths in descending order so files are deleted before their
        // parent directories
        remove.sort().reverse().forEach(function(path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
      }};
  
  var NODEFS={isWindows:false,staticInit:function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
      },mount:function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
      },createNode:function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
      },getMode:function (path) {
        var stat;
        try {
          stat = fs.lstatSync(path);
          if (NODEFS.isWindows) {
            // Node.js on Windows never represents permission bit 'x', so
            // propagate read bits to execute bits
            stat.mode = stat.mode | ((stat.mode & 292) >> 2);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
      },realPath:function (node) {
        var parts = [];
        while (node.parent !== node) {
          parts.push(node.name);
          node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
      },flagsToPermissionStringMap:{0:"r",1:"r+",2:"r+",64:"r",65:"r+",66:"r+",129:"rx+",193:"rx+",514:"w+",577:"w",578:"w+",705:"wx",706:"wx+",1024:"a",1025:"a",1026:"a+",1089:"a",1090:"a+",1153:"ax",1154:"ax+",1217:"ax",1218:"ax+",4096:"rs",4098:"rs+"},flagsToPermissionString:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        if (flags in NODEFS.flagsToPermissionStringMap) {
          return NODEFS.flagsToPermissionStringMap[flags];
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },node_ops:{getattr:function (node) {
          var path = NODEFS.realPath(node);
          var stat;
          try {
            stat = fs.lstatSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          // node.js v0.10.20 doesn't report blksize and blocks on Windows. Fake them with default blksize of 4096.
          // See http://support.microsoft.com/kb/140365
          if (NODEFS.isWindows && !stat.blksize) {
            stat.blksize = 4096;
          }
          if (NODEFS.isWindows && !stat.blocks) {
            stat.blocks = (stat.size+stat.blksize-1)/stat.blksize|0;
          }
          return {
            dev: stat.dev,
            ino: stat.ino,
            mode: stat.mode,
            nlink: stat.nlink,
            uid: stat.uid,
            gid: stat.gid,
            rdev: stat.rdev,
            size: stat.size,
            atime: stat.atime,
            mtime: stat.mtime,
            ctime: stat.ctime,
            blksize: stat.blksize,
            blocks: stat.blocks
          };
        },setattr:function (node, attr) {
          var path = NODEFS.realPath(node);
          try {
            if (attr.mode !== undefined) {
              fs.chmodSync(path, attr.mode);
              // update the common node structure mode as well
              node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
              var date = new Date(attr.timestamp);
              fs.utimesSync(path, date, date);
            }
            if (attr.size !== undefined) {
              fs.truncateSync(path, attr.size);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },lookup:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          var mode = NODEFS.getMode(path);
          return NODEFS.createNode(parent, name, mode);
        },mknod:function (parent, name, mode, dev) {
          var node = NODEFS.createNode(parent, name, mode, dev);
          // create the backing node for this in the fs root as well
          var path = NODEFS.realPath(node);
          try {
            if (FS.isDir(node.mode)) {
              fs.mkdirSync(path, node.mode);
            } else {
              fs.writeFileSync(path, '', { mode: node.mode });
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return node;
        },rename:function (oldNode, newDir, newName) {
          var oldPath = NODEFS.realPath(oldNode);
          var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
          try {
            fs.renameSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },unlink:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.unlinkSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },rmdir:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.rmdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readdir:function (node) {
          var path = NODEFS.realPath(node);
          try {
            return fs.readdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },symlink:function (parent, newName, oldPath) {
          var newPath = PATH.join2(NODEFS.realPath(parent), newName);
          try {
            fs.symlinkSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readlink:function (node) {
          var path = NODEFS.realPath(node);
          try {
            path = fs.readlinkSync(path);
            path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
            return path;
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }},stream_ops:{open:function (stream) {
          var path = NODEFS.realPath(stream.node);
          try {
            if (FS.isFile(stream.node.mode)) {
              stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags));
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },close:function (stream) {
          try {
            if (FS.isFile(stream.node.mode) && stream.nfd) {
              fs.closeSync(stream.nfd);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },read:function (stream, buffer, offset, length, position) {
          // Node.js < 6 compatibility: node errors on 0 length reads
          if (length === 0) return 0;
          // Node.js < 4.5 compatibility: Buffer.from does not support ArrayBuffer
          var buf = Buffer.from ? Buffer.from(buffer.buffer) : new Buffer(buffer.buffer);
          try {
            return fs.readSync(stream.nfd, buf, offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },write:function (stream, buffer, offset, length, position) {
          // Node.js < 4.5 compatibility: Buffer.from does not support ArrayBuffer
          var buf = Buffer.from ? Buffer.from(buffer.buffer) : new Buffer(buffer.buffer);
          try {
            return fs.writeSync(stream.nfd, buf, offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              try {
                var stat = fs.fstatSync(stream.nfd);
                position += stat.size;
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
              }
            }
          }
  
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
  
          return position;
        }}};
  
  var WORKERFS={DIR_MODE:16895,FILE_MODE:33279,reader:null,mount:function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
          // return the parent node, creating subdirs as necessary
          var parts = path.split('/');
          var parent = root;
          for (var i = 0; i < parts.length-1; i++) {
            var curr = parts.slice(0, i+1).join('/');
            // Issue 4254: Using curr as a node name will prevent the node
            // from being found in FS.nameTable when FS.open is called on
            // a path which holds a child of this node,
            // given that all FS functions assume node names
            // are just their corresponding parts within their given path,
            // rather than incremental aggregates which include their parent's
            // directories.
            if (!createdParents[curr]) {
              createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
            }
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          var parts = path.split('/');
          return parts[parts.length-1];
        }
        // We also accept FileList here, by using Array.prototype
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
          WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
          WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
          pack['metadata'].files.forEach(function(file) {
            var name = file.filename.substr(1); // remove initial slash
            WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack['blob'].slice(file.start, file.end));
          });
        });
        return root;
      },createNode:function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
          node.size = contents.size;
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },node_ops:{getattr:function (node) {
          return {
            dev: 1,
            ino: undefined,
            mode: node.mode,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: undefined,
            size: node.size,
            atime: new Date(node.timestamp),
            mtime: new Date(node.timestamp),
            ctime: new Date(node.timestamp),
            blksize: 4096,
            blocks: Math.ceil(node.size / 4096),
          };
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
        },lookup:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },mknod:function (parent, name, mode, dev) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rename:function (oldNode, newDir, newName) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },unlink:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rmdir:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readdir:function (node) {
          var entries = ['.', '..'];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newName, oldPath) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readlink:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          if (position >= stream.node.size) return 0;
          var chunk = stream.node.contents.slice(position, position + length);
          var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        },write:function (stream, buffer, offset, length, position) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.size;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        }}};
  
  var _stdin=STATICTOP; STATICTOP += 16;;
  
  var _stdout=STATICTOP; STATICTOP += 16;;
  
  var _stderr=STATICTOP; STATICTOP += 16;;var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
        return ___setErrNo(e.errno);
      },lookupPath:function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        for (var key in defaults) {
          if (opts[key] === undefined) {
            opts[key] = defaults[key];
          }
        }
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
        }
  
        // split the path
        var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), false);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(ERRNO_CODES.ELOOP);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },getPath:function (node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
          }
          path = path ? node.name + '/' + path : node.name;
          node = node.parent;
        }
      },hashName:function (parentid, name) {
        var hash = 0;
  
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },hashAddNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },hashRemoveNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },lookupNode:function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
          throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },createNode:function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
          FS.FSNode = function(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;  // root node sets parent to itself
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.mounted = null;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.node_ops = {};
            this.stream_ops = {};
            this.rdev = rdev;
          };
  
          FS.FSNode.prototype = {};
  
          // compatibility
          var readMode = 292 | 73;
          var writeMode = 146;
  
          // NOTE we must use Object.defineProperties instead of individual calls to
          // Object.defineProperty in order to make closure compiler happy
          Object.defineProperties(FS.FSNode.prototype, {
            read: {
              get: function() { return (this.mode & readMode) === readMode; },
              set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
            },
            write: {
              get: function() { return (this.mode & writeMode) === writeMode; },
              set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
            },
            isFolder: {
              get: function() { return FS.isDir(this.mode); }
            },
            isDevice: {
              get: function() { return FS.isChrdev(this.mode); }
            }
          });
        }
  
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },destroyNode:function (node) {
        FS.hashRemoveNode(node);
      },isRoot:function (node) {
        return node === node.parent;
      },isMountpoint:function (node) {
        return !!node.mounted;
      },isFile:function (mode) {
        return (mode & 61440) === 32768;
      },isDir:function (mode) {
        return (mode & 61440) === 16384;
      },isLink:function (mode) {
        return (mode & 61440) === 40960;
      },isChrdev:function (mode) {
        return (mode & 61440) === 8192;
      },isBlkdev:function (mode) {
        return (mode & 61440) === 24576;
      },isFIFO:function (mode) {
        return (mode & 61440) === 4096;
      },isSocket:function (mode) {
        return (mode & 49152) === 49152;
      },flagModes:{"r":0,"rs":1052672,"r+":2,"w":577,"wx":705,"xw":705,"w+":578,"wx+":706,"xw+":706,"a":1089,"ax":1217,"xa":1217,"a+":1090,"ax+":1218,"xa+":1218},modeStringToFlags:function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === 'undefined') {
          throw new Error('Unknown file open mode: ' + str);
        }
        return flags;
      },flagsToPermissionString:function (flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },nodePermissions:function (node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
          return ERRNO_CODES.EACCES;
        } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
          return ERRNO_CODES.EACCES;
        }
        return 0;
      },mayLookup:function (dir) {
        var err = FS.nodePermissions(dir, 'x');
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0;
      },mayCreate:function (dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return ERRNO_CODES.EEXIST;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },mayDelete:function (dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var err = FS.nodePermissions(dir, 'wx');
        if (err) {
          return err;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return ERRNO_CODES.ENOTDIR;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return ERRNO_CODES.EBUSY;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return ERRNO_CODES.EISDIR;
          }
        }
        return 0;
      },mayOpen:function (node, flags) {
        if (!node) {
          return ERRNO_CODES.ENOENT;
        }
        if (FS.isLink(node.mode)) {
          return ERRNO_CODES.ELOOP;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return ERRNO_CODES.EISDIR;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },MAX_OPEN_FDS:4096,nextfd:function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE);
      },getStream:function (fd) {
        return FS.streams[fd];
      },createStream:function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
          FS.FSStream = function(){};
          FS.FSStream.prototype = {};
          // compatibility
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get: function() { return this.node; },
              set: function(val) { this.node = val; }
            },
            isRead: {
              get: function() { return (this.flags & 2097155) !== 1; }
            },
            isWrite: {
              get: function() { return (this.flags & 2097155) !== 0; }
            },
            isAppend: {
              get: function() { return (this.flags & 1024); }
            }
          });
        }
        // clone it, so we can return an instance of FSStream
        var newStream = new FS.FSStream();
        for (var p in stream) {
          newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },closeStream:function (fd) {
        FS.streams[fd] = null;
      },chrdev_stream_ops:{open:function (stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },llseek:function () {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }},major:function (dev) {
        return ((dev) >> 8);
      },minor:function (dev) {
        return ((dev) & 0xff);
      },makedev:function (ma, mi) {
        return ((ma) << 8 | (mi));
      },registerDevice:function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },getDevice:function (dev) {
        return FS.devices[dev];
      },getMounts:function (mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push.apply(check, m.mounts);
        }
  
        return mounts;
      },syncfs:function (populate, callback) {
        if (typeof(populate) === 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(err) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(err);
        }
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(err);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach(function (mount) {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },mount:function (type, opts, mountpoint) {
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
          }
        }
  
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },unmount:function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach(function (hash) {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.indexOf(current.mount) !== -1) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },lookup:function (parent, name) {
        return parent.node_ops.lookup(parent, name);
      },mknod:function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },create:function (path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },mkdir:function (path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },mkdirTree:function (path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != ERRNO_CODES.EEXIST) throw e;
          }
        }
      },mkdev:function (path, mode, dev) {
        if (typeof(dev) === 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },symlink:function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },rename:function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
        try {
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
        } catch (e) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(ERRNO_CODES.EXDEV);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        // new path should not be an ancestor of the old path
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        err = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          err = FS.nodePermissions(old_dir, 'w');
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        try {
          if (FS.trackingDelegate['willMovePath']) {
            FS.trackingDelegate['willMovePath'](old_path, new_path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
        try {
          if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
        } catch(e) {
          console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
      },rmdir:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        return node.node_ops.readdir(node);
      },unlink:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(ERRNO_CODES.EBUSY);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readlink:function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },stat:function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        return node.node_ops.getattr(node);
      },lstat:function (path) {
        return FS.stat(path, true);
      },chmod:function (path, mode, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },lchmod:function (path, mode) {
        FS.chmod(path, mode, true);
      },fchmod:function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chmod(stream.node, mode);
      },chown:function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },lchown:function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },fchown:function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        FS.chown(stream.node, uid, gid);
      },truncate:function (path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var err = FS.nodePermissions(node, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },ftruncate:function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        FS.truncate(stream.node, len);
      },utime:function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },open:function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path === 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(ERRNO_CODES.EEXIST);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var err = FS.mayOpen(node, flags);
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        // do truncation if necessary
        if ((flags & 512)) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        }, fd_start, fd_end);
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
            Module['printErr']('read file: ' + path);
          }
        }
        try {
          if (FS.trackingDelegate['onOpenFile']) {
            var trackingFlags = 0;
            if ((flags & 2097155) !== 1) {
              trackingFlags |= FS.tracking.openFlags.READ;
            }
            if ((flags & 2097155) !== 0) {
              trackingFlags |= FS.tracking.openFlags.WRITE;
            }
            FS.trackingDelegate['onOpenFile'](path, trackingFlags);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
        }
        return stream;
      },close:function (stream) {
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
      },llseek:function (stream, offset, whence) {
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },read:function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },write:function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EISDIR);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if (stream.flags & 1024) {
          // seek to the end before writing in append mode
          position = FS.llseek(stream, 0, 2);
        }
        var seeking = true;
        if (typeof position === 'undefined') {
          position = stream.position;
          seeking = false;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(ERRNO_CODES.ESPIPE);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
          if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
        } catch(e) {
          console.log("FS.trackingDelegate['onWriteToFile']('"+path+"') threw an exception: " + e.message);
        }
        return bytesWritten;
      },allocate:function (stream, offset, length) {
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },mmap:function (stream, buffer, offset, length, position, prot, flags) {
        // TODO if PROT is PROT_WRITE, make sure we have write access
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(ERRNO_CODES.EACCES);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
      },msync:function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },munmap:function (stream) {
        return 0;
      },ioctl:function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTTY);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },readFile:function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'r';
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },writeFile:function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'w';
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === 'string') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, 0, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, 0, opts.canOwn);
        } else {
          throw new Error('Unsupported data type');
        }
        FS.close(stream);
      },cwd:function () {
        return FS.currentPath;
      },chdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR);
        }
        var err = FS.nodePermissions(lookup.node, 'x');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
      },createDefaultDirectories:function () {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },createDefaultDevices:function () {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: function() { return 0; },
          write: function(stream, buffer, offset, length, pos) { return length; }
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using Module['printErr']
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        var random_device;
        if (typeof crypto !== 'undefined') {
          // for modern web browsers
          var randomBuffer = new Uint8Array(1);
          random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
        } else if (ENVIRONMENT_IS_NODE) {
          // for nodejs
          random_device = function() { return require('crypto')['randomBytes'](1)[0]; };
        } else {
          // default for ES5 platforms
          random_device = function() { return (Math.random()*256)|0; };
        }
        FS.createDevice('/dev', 'random', random_device);
        FS.createDevice('/dev', 'urandom', random_device);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },createSpecialDirectories:function () {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount: function() {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup: function(parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: function() { return stream.path } }
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },createStandardStreams:function () {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 'r');
        assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
  
        var stdout = FS.open('/dev/stdout', 'w');
        assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
  
        var stderr = FS.open('/dev/stderr', 'w');
        assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
      },ensureErrnoError:function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          //Module.printErr(stackTrace()); // useful for debugging
          this.node = node;
          this.setErrno = function(errno) {
            this.errno = errno;
            for (var key in ERRNO_CODES) {
              if (ERRNO_CODES[key] === errno) {
                this.code = key;
                break;
              }
            }
          };
          this.setErrno(errno);
          this.message = ERRNO_MESSAGES[errno];
          // Node.js compatibility: assigning on this.stack fails on Node 4 (but fixed on Node 8)
          if (this.stack) Object.defineProperty(this, "stack", { value: (new Error).stack, writable: true });
          if (this.stack) this.stack = demangleAll(this.stack);
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [ERRNO_CODES.ENOENT].forEach(function(code) {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
      },staticInit:function () {
        FS.ensureErrnoError();
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
          'IDBFS': IDBFS,
          'NODEFS': NODEFS,
          'WORKERFS': WORKERFS,
        };
      },init:function (input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        FS.ensureErrnoError();
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },quit:function () {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        var fflush = Module['_fflush'];
        if (fflush) fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },getMode:function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      },joinPath:function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == '/') path = path.substr(1);
        return path;
      },absolutePath:function (relative, base) {
        return PATH.resolve(base, relative);
      },standardizePath:function (path) {
        return PATH.normalize(path);
      },findObject:function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },analyzePath:function (path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },createFolder:function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
      },createPath:function (parent, path, canRead, canWrite) {
        parent = typeof parent === 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
      },createDataFile:function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data === 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 'w');
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },createDevice:function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open: function(stream) {
            stream.seekable = false;
          },
          close: function(stream) {
            // flush any pending line data
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read: function(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write: function(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },createLink:function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success;
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = []; // Loaded chunks. Index is the chunk number
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length-1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize)|0;
          return this.getter(chunkNum)[chunkOffset];
        }
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        }
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
          var chunkSize = 1024*1024; // Chunk size in bytes
  
          if (!hasByteServing) chunkSize = datalength;
  
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
  
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = this;
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum+1) * chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
  
          if (usesGzip || !datalength) {
            // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
            chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
            datalength = this.getter(0).length;
            chunkSize = datalength;
            console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
          }
  
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              }
            },
            chunkSize: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              }
            }
          });
  
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            if (!FS.forceLoadFile(node)) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            return fn.apply(null, arguments);
          };
        });
        // use a custom read function
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        };
        node.stream_ops = stream_ops;
        return node;
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init(); // XXX perhaps this method should move onto Browser?
        // TODO we should allow people to just pass in a complete filename instead
        // of parent and name being that we just join them anyways
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
        function processData(byteArray) {
          function finish(byteArray) {
            if (preFinish) preFinish();
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            if (onload) onload();
            removeRunDependency(dep);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency(dep);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },indexedDB:function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      },DB_NAME:function () {
        return 'EM_FS_' + window.location.pathname;
      },DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
          console.log('creating db');
          var db = openRequest.result;
          db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var putRequest = files.put(FS.analyzePath(path).object.contents, path);
            putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
            putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      },loadFilesFromDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = onerror; // no database to load from
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          try {
            var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
          } catch(e) {
            onerror(e);
            return;
          }
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var getRequest = files.get(path);
            getRequest.onsuccess = function getRequest_onsuccess() {
              if (FS.analyzePath(path).exists) {
                FS.unlink(path);
              }
              FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
              ok++;
              if (ok + fail == total) finish();
            };
            getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      }};var SYSCALLS={DEFAULT_POLLMASK:5,mappings:{},umask:511,calculateAt:function (dirfd, path) {
        if (path[0] !== '/') {
          // relative path
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
            dir = dirstream.path;
          }
          path = PATH.join2(dir, path);
        }
        return path;
      },doStat:function (func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
            // an error occurred while trying to look up the path; we should just report ENOTDIR
            return -ERRNO_CODES.ENOTDIR;
          }
          throw e;
        }
        HEAP32[((buf)>>2)]=stat.dev;
        HEAP32[(((buf)+(4))>>2)]=0;
        HEAP32[(((buf)+(8))>>2)]=stat.ino;
        HEAP32[(((buf)+(12))>>2)]=stat.mode;
        HEAP32[(((buf)+(16))>>2)]=stat.nlink;
        HEAP32[(((buf)+(20))>>2)]=stat.uid;
        HEAP32[(((buf)+(24))>>2)]=stat.gid;
        HEAP32[(((buf)+(28))>>2)]=stat.rdev;
        HEAP32[(((buf)+(32))>>2)]=0;
        HEAP32[(((buf)+(36))>>2)]=stat.size;
        HEAP32[(((buf)+(40))>>2)]=4096;
        HEAP32[(((buf)+(44))>>2)]=stat.blocks;
        HEAP32[(((buf)+(48))>>2)]=(stat.atime.getTime() / 1000)|0;
        HEAP32[(((buf)+(52))>>2)]=0;
        HEAP32[(((buf)+(56))>>2)]=(stat.mtime.getTime() / 1000)|0;
        HEAP32[(((buf)+(60))>>2)]=0;
        HEAP32[(((buf)+(64))>>2)]=(stat.ctime.getTime() / 1000)|0;
        HEAP32[(((buf)+(68))>>2)]=0;
        HEAP32[(((buf)+(72))>>2)]=stat.ino;
        return 0;
      },doMsync:function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
      },doMkdir:function (path, mode) {
        // remove a trailing slash, if one - /a/b/ has basename of '', but
        // we want to create b in the context of this function
        path = PATH.normalize(path);
        if (path[path.length-1] === '/') path = path.substr(0, path.length-1);
        FS.mkdir(path, mode, 0);
        return 0;
      },doMknod:function (path, mode, dev) {
        // we don't want this in the JS API as it uses mknod to create all nodes.
        switch (mode & 61440) {
          case 32768:
          case 8192:
          case 24576:
          case 4096:
          case 49152:
            break;
          default: return -ERRNO_CODES.EINVAL;
        }
        FS.mknod(path, mode, dev);
        return 0;
      },doReadlink:function (path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
  
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf+len];
        stringToUTF8(ret, buf, bufsize+1);
        // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
        // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
        HEAP8[buf+len] = endChar;
  
        return len;
      },doAccess:function (path, amode) {
        if (amode & ~7) {
          // need a valid mode
          return -ERRNO_CODES.EINVAL;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        var perms = '';
        if (amode & 4) perms += 'r';
        if (amode & 2) perms += 'w';
        if (amode & 1) perms += 'x';
        if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
          return -ERRNO_CODES.EACCES;
        }
        return 0;
      },doDup:function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
      },doReadv:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.read(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break; // nothing more to read
        }
        return ret;
      },doWritev:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.write(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
        }
        return ret;
      },varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },getStreamFromFD:function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream;
      },getSocketFromFD:function () {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket;
      },getSocketAddress:function (allowNull) {
        var addrp = SYSCALLS.get(), addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall145(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // readv
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doReadv(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21509:
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21510:
        case 21511:
        case 21512:
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[((argp)>>2)]=0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL; // not supported
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        default: abort('bad ioctl syscall ' + op);
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

  function ___unlock() {}

   

  function _abort() {
      Module['abort']();
    }

   

   

  
  function __exit(status) {
      // void _exit(int status);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/exit.html
      Module['exit'](status);
    }function _exit(status) {
      __exit(status);
    }



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

   
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });;
__ATINIT__.unshift(function() { TTY.init() });__ATEXIT__.push(function() { TTY.shutdown() });;
if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var NODEJS_PATH = require("path"); NODEFS.staticInit(); };
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}



function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "___lock": ___lock, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall145": ___syscall145, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "__exit": __exit, "_abort": _abort, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_exit": _exit, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'almost asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var ___lock=env.___lock;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall145=env.___syscall145;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var __exit=env.__exit;
  var _abort=env._abort;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _exit=env._exit;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _main($argc,$argv) {
 $argc = $argc|0;
 $argv = $argv|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $answer = 0, $argc$addr = 0, $argv$addr = 0, $call16 = 0, $call18 = 0, $call22 = 0, $colour = 0, $name = 0, $retval = 0, $tobool = 0, $tobool19 = 0, $tobool23 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer11 = 0;
 var $vararg_buffer14 = 0, $vararg_buffer16 = 0, $vararg_buffer19 = 0, $vararg_buffer21 = 0, $vararg_buffer3 = 0, $vararg_buffer6 = 0, $vararg_buffer8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 688|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(688|0);
 $vararg_buffer21 = sp + 72|0;
 $vararg_buffer19 = sp + 64|0;
 $vararg_buffer16 = sp + 56|0;
 $vararg_buffer14 = sp + 48|0;
 $vararg_buffer11 = sp + 40|0;
 $vararg_buffer8 = sp + 32|0;
 $vararg_buffer6 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $name = sp + 488|0;
 $colour = sp + 288|0;
 $answer = sp + 88|0;
 $retval = 0;
 $argc$addr = $argc;
 $argv$addr = $argv;
 while(1) {
  (_printf(884,$vararg_buffer)|0);
  $0 = HEAP32[66]|0;
  (_fflush($0)|0);
  HEAP32[$vararg_buffer1>>2] = $name;
  (_scanf(902,$vararg_buffer1)|0);
  HEAP32[$vararg_buffer3>>2] = $name;
  (_printf(905,$vararg_buffer3)|0);
  (_printf(916,$vararg_buffer6)|0);
  $1 = HEAP32[66]|0;
  (_fflush($1)|0);
  HEAP32[$vararg_buffer8>>2] = $colour;
  (_scanf(902,$vararg_buffer8)|0);
  HEAP32[$vararg_buffer11>>2] = $colour;
  (_printf(948,$vararg_buffer11)|0);
  $2 = HEAP32[34]|0;
  (_fprintf($2,971,$vararg_buffer14)|0);
  $3 = HEAP32[34]|0;
  (_fflush($3)|0);
  HEAP32[$vararg_buffer16>>2] = $answer;
  (_scanf(902,$vararg_buffer16)|0);
  $call16 = (_strcmp($answer,996)|0);
  $tobool = ($call16|0)!=(0);
  if (!($tobool)) {
   continue;
  }
  $call18 = (_strcmp($answer,1000)|0);
  $tobool19 = ($call18|0)!=(0);
  if (!($tobool19)) {
   continue;
  }
  $call22 = (_strcmp($answer,1004)|0);
  $tobool23 = ($call22|0)!=(0);
  if ($tobool23) {
   break;
  }
 }
 $4 = HEAP32[34]|0;
 (_fprintf($4,1008,$vararg_buffer19)|0);
 HEAP32[$vararg_buffer21>>2] = $name;
 (_printf(1010,$vararg_buffer21)|0);
 _exit(0);
 // unreachable;
 return (0)|0;
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i175 = 0, $$pre$i178 = 0, $$pre$i45$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i176Z2D = 0, $$pre$phi$i46$iZ2D = 0, $$pre$phi$iZ2D = 0, $$pre$phiZ2D = 0, $$pre5$i$i = 0, $$sink$i = 0, $$sink$i$i = 0, $$sink$i154 = 0, $$sink2$i = 0, $$sink2$i172 = 0, $$sink5$i = 0, $$v$0$i = 0, $0 = 0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0;
 var $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0;
 var $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0;
 var $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F$0$i$i = 0, $F104$0 = 0, $F197$0$i = 0, $F224$0$i$i = 0, $F290$0$i = 0, $I252$0$i$i = 0, $I316$0$i = 0, $I57$0$i$i = 0, $K105$0$i$i = 0, $K305$0$i$i = 0, $K373$0$i = 0, $R$1$i = 0, $R$1$i$i = 0, $R$1$i165 = 0, $R$3$i = 0;
 var $R$3$i$i = 0, $R$3$i168 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i164 = 0, $T$0$i = 0, $T$0$i$i = 0, $T$0$i47$i = 0, $add$i = 0, $add$i$i = 0, $add$i145 = 0, $add$i179 = 0, $add$ptr = 0, $add$ptr$i = 0, $add$ptr$i$i = 0, $add$ptr$i$i$i = 0, $add$ptr$i158 = 0, $add$ptr$i16$i = 0, $add$ptr$i192 = 0, $add$ptr$i2$i$i = 0;
 var $add$ptr$i21$i = 0, $add$ptr$i49$i = 0, $add$ptr14$i$i = 0, $add$ptr15$i$i = 0, $add$ptr16$i$i = 0, $add$ptr166 = 0, $add$ptr169 = 0, $add$ptr17$i$i = 0, $add$ptr178 = 0, $add$ptr181$i = 0, $add$ptr182 = 0, $add$ptr189$i = 0, $add$ptr190$i = 0, $add$ptr193 = 0, $add$ptr199 = 0, $add$ptr2$i$i = 0, $add$ptr205$i$i = 0, $add$ptr212$i$i = 0, $add$ptr225$i = 0, $add$ptr227$i = 0;
 var $add$ptr24$i$i = 0, $add$ptr262$i = 0, $add$ptr269$i = 0, $add$ptr273$i = 0, $add$ptr282$i = 0, $add$ptr3$i$i = 0, $add$ptr30$i$i = 0, $add$ptr369$i$i = 0, $add$ptr4$i$i = 0, $add$ptr4$i$i$i = 0, $add$ptr4$i26$i = 0, $add$ptr4$i54$i = 0, $add$ptr441$i = 0, $add$ptr5$i$i = 0, $add$ptr6$i$i = 0, $add$ptr6$i$i$i = 0, $add$ptr6$i58$i = 0, $add$ptr7$i$i = 0, $add$ptr81$i$i = 0, $add$ptr95 = 0;
 var $add$ptr98 = 0, $add10$i = 0, $add101$i = 0, $add110$i = 0, $add13$i = 0, $add14$i = 0, $add140$i = 0, $add144 = 0, $add150$i = 0, $add17$i = 0, $add17$i182 = 0, $add177$i = 0, $add18$i = 0, $add19$i = 0, $add2 = 0, $add20$i = 0, $add206$i$i = 0, $add212$i = 0, $add215$i = 0, $add22$i = 0;
 var $add246$i = 0, $add26$i$i = 0, $add268$i = 0, $add269$i$i = 0, $add274$i$i = 0, $add278$i$i = 0, $add280$i$i = 0, $add283$i$i = 0, $add337$i = 0, $add342$i = 0, $add346$i = 0, $add348$i = 0, $add351$i = 0, $add46$i = 0, $add50 = 0, $add51$i = 0, $add54 = 0, $add54$i = 0, $add58 = 0, $add62 = 0;
 var $add64 = 0, $add74$i$i = 0, $add77$i = 0, $add78$i = 0, $add79$i$i = 0, $add8 = 0, $add82$i = 0, $add83$i$i = 0, $add85$i$i = 0, $add86$i = 0, $add88$i$i = 0, $add9$i = 0, $add90$i = 0, $add92$i = 0, $and = 0, $and$i = 0, $and$i$i = 0, $and$i$i$i = 0, $and$i142 = 0, $and$i17$i = 0;
 var $and$i22$i = 0, $and$i50$i = 0, $and100$i = 0, $and103$i = 0, $and104$i = 0, $and106 = 0, $and11$add51$i = 0, $and11$i = 0, $and119$i$i = 0, $and12$i = 0, $and13$i = 0, $and13$i$i = 0, $and133$i$i = 0, $and14 = 0, $and145 = 0, $and17$i = 0, $and194$i = 0, $and194$i203 = 0, $and199$i = 0, $and209$i$i = 0;
 var $and21$i = 0, $and21$i148 = 0, $and227$i$i = 0, $and236$i = 0, $and264$i$i = 0, $and268$i$i = 0, $and273$i$i = 0, $and282$i$i = 0, $and29$i = 0, $and292$i = 0, $and295$i$i = 0, $and3$i = 0, $and3$i$i = 0, $and3$i$i$i = 0, $and3$i24$i = 0, $and3$i52$i = 0, $and30$i = 0, $and318$i$i = 0, $and32$i = 0, $and32$i$i = 0;
 var $and33$i$i = 0, $and331$i = 0, $and336$i = 0, $and341$i = 0, $and350$i = 0, $and363$i = 0, $and37$i$i = 0, $and387$i = 0, $and4 = 0, $and40$i$i = 0, $and41 = 0, $and42$i = 0, $and43 = 0, $and46 = 0, $and49 = 0, $and49$i = 0, $and49$i$i = 0, $and53 = 0, $and57 = 0, $and6$i = 0;
 var $and6$i$i = 0, $and6$i10$i = 0, $and6$i27$i = 0, $and61 = 0, $and64$i = 0, $and68$i = 0, $and69$i$i = 0, $and7 = 0, $and73$i = 0, $and73$i$i = 0, $and74 = 0, $and77$i = 0, $and78$i$i = 0, $and8$i = 0, $and80$i = 0, $and81$i = 0, $and85$i = 0, $and87$i$i = 0, $and89$i = 0, $and9$i = 0;
 var $and96$i$i = 0, $arrayidx = 0, $arrayidx$i = 0, $arrayidx$i$i = 0, $arrayidx$i14$i = 0, $arrayidx$i149 = 0, $arrayidx$i37$i = 0, $arrayidx103 = 0, $arrayidx103$i$i = 0, $arrayidx106$i = 0, $arrayidx107$i$i = 0, $arrayidx113$i = 0, $arrayidx113$i155 = 0, $arrayidx121$i = 0, $arrayidx123$i$i = 0, $arrayidx126$i$i = 0, $arrayidx137$i = 0, $arrayidx143$i$i = 0, $arrayidx148$i = 0, $arrayidx151$i = 0;
 var $arrayidx151$i$i = 0, $arrayidx154$i = 0, $arrayidx155$i = 0, $arrayidx161$i = 0, $arrayidx165$i = 0, $arrayidx165$i166 = 0, $arrayidx178$i$i = 0, $arrayidx184$i = 0, $arrayidx184$i$i = 0, $arrayidx195$i$i = 0, $arrayidx196$i = 0, $arrayidx204$i = 0, $arrayidx212$i = 0, $arrayidx223$i$i = 0, $arrayidx228$i = 0, $arrayidx23$i = 0, $arrayidx233$i = 0, $arrayidx239$i = 0, $arrayidx245$i = 0, $arrayidx256$i = 0;
 var $arrayidx27$i = 0, $arrayidx276$i = 0, $arrayidx287$i$i = 0, $arrayidx289$i = 0, $arrayidx290$i$i = 0, $arrayidx325$i$i = 0, $arrayidx355$i = 0, $arrayidx358$i = 0, $arrayidx394$i = 0, $arrayidx40$i = 0, $arrayidx44$i = 0, $arrayidx61$i = 0, $arrayidx65$i = 0, $arrayidx66 = 0, $arrayidx71$i = 0, $arrayidx75$i = 0, $arrayidx91$i$i = 0, $arrayidx92$i$i = 0, $arrayidx94$i = 0, $arrayidx94$i153 = 0;
 var $arrayidx96$i$i = 0, $bk = 0, $bk$i = 0, $bk$i$i = 0, $bk$i160 = 0, $bk$i35$i = 0, $bk102$i$i = 0, $bk122 = 0, $bk124 = 0, $bk136$i = 0, $bk139$i$i = 0, $bk158$i$i = 0, $bk161$i$i = 0, $bk218$i = 0, $bk220$i = 0, $bk246$i$i = 0, $bk248$i$i = 0, $bk302$i$i = 0, $bk311$i = 0, $bk313$i = 0;
 var $bk338$i$i = 0, $bk357$i$i = 0, $bk360$i$i = 0, $bk370$i = 0, $bk407$i = 0, $bk429$i = 0, $bk43$i$i = 0, $bk432$i = 0, $bk47$i = 0, $bk55$i$i = 0, $bk67$i$i = 0, $bk74$i$i = 0, $bk78 = 0, $bk82$i$i = 0, $br$2$ph$i = 0, $call107$i = 0, $call131$i = 0, $call132$i = 0, $call275$i = 0, $call37$i = 0;
 var $call68$i = 0, $call83$i = 0, $child$i$i = 0, $child166$i$i = 0, $child289$i$i = 0, $child357$i = 0, $cmp = 0, $cmp$i = 0, $cmp$i$i$i = 0, $cmp$i11$i = 0, $cmp$i177 = 0, $cmp$i18$i = 0, $cmp$i23$i = 0, $cmp$i3$i$i = 0, $cmp$i51$i = 0, $cmp$i9$i = 0, $cmp1 = 0, $cmp1$i = 0, $cmp10 = 0, $cmp100$i$i = 0;
 var $cmp102$i = 0, $cmp104$i$i = 0, $cmp105$i = 0, $cmp106$i$i = 0, $cmp107$i = 0, $cmp108$i = 0, $cmp108$i$i = 0, $cmp112$i$i = 0, $cmp113 = 0, $cmp116$i = 0, $cmp118$i = 0, $cmp119$i = 0, $cmp12$i = 0, $cmp120$i$i = 0, $cmp120$i42$i = 0, $cmp121$i = 0, $cmp123$i = 0, $cmp124$i$i = 0, $cmp126$i = 0, $cmp127$i = 0;
 var $cmp128 = 0, $cmp128$i = 0, $cmp128$i$i = 0, $cmp130$i = 0, $cmp133$i = 0, $cmp133$i$i = 0, $cmp133$i195 = 0, $cmp135$i = 0, $cmp137$i = 0, $cmp137$i$i = 0, $cmp137$i196 = 0, $cmp138$i = 0, $cmp139 = 0, $cmp140$i = 0, $cmp141$i = 0, $cmp142$i = 0, $cmp146 = 0, $cmp147$i = 0, $cmp14799$i = 0, $cmp15 = 0;
 var $cmp15$i = 0, $cmp151$i = 0, $cmp152$i = 0, $cmp153$i$i = 0, $cmp155$i = 0, $cmp156 = 0, $cmp156$i = 0, $cmp156$i$i = 0, $cmp157$i = 0, $cmp159$i = 0, $cmp159$i198 = 0, $cmp16 = 0, $cmp160$i$i = 0, $cmp162 = 0, $cmp162$i = 0, $cmp162$i199 = 0, $cmp166$i = 0, $cmp168$i$i = 0, $cmp171$i = 0, $cmp172$i$i = 0;
 var $cmp174$i = 0, $cmp180$i = 0, $cmp185$i = 0, $cmp185$i$i = 0, $cmp186 = 0, $cmp186$i = 0, $cmp189$i$i = 0, $cmp19$i = 0, $cmp190$i = 0, $cmp191$i = 0, $cmp198$i = 0, $cmp2$i$i = 0, $cmp2$i$i$i = 0, $cmp20$i$i = 0, $cmp203$i = 0, $cmp208$i = 0, $cmp209$i = 0, $cmp21$i = 0, $cmp215$i$i = 0, $cmp217$i = 0;
 var $cmp218$i = 0, $cmp221$i = 0, $cmp224$i = 0, $cmp228$i = 0, $cmp229$i = 0, $cmp233$i = 0, $cmp236$i$i = 0, $cmp24$i = 0, $cmp24$i$i = 0, $cmp246$i = 0, $cmp250$i = 0, $cmp254$i$i = 0, $cmp257$i = 0, $cmp258$i$i = 0, $cmp26$i = 0, $cmp265$i = 0, $cmp27$i$i = 0, $cmp28$i = 0, $cmp28$i$i = 0, $cmp284$i = 0;
 var $cmp287$i = 0, $cmp29 = 0, $cmp3$i$i = 0, $cmp301$i = 0, $cmp306$i$i = 0, $cmp31 = 0, $cmp319$i = 0, $cmp319$i$i = 0, $cmp32$i = 0, $cmp32$i184 = 0, $cmp323$i = 0, $cmp327$i$i = 0, $cmp33$i = 0, $cmp332$i$i = 0, $cmp34$i = 0, $cmp34$i$i = 0, $cmp35$i = 0, $cmp350$i$i = 0, $cmp36$i = 0, $cmp36$i$i = 0;
 var $cmp374$i = 0, $cmp38$i = 0, $cmp38$i$i = 0, $cmp388$i = 0, $cmp396$i = 0, $cmp40$i = 0, $cmp401$i = 0, $cmp41$i$i = 0, $cmp42$i$i = 0, $cmp422$i = 0, $cmp43$i = 0, $cmp44$i$i = 0, $cmp45$i = 0, $cmp45$i152 = 0, $cmp46$i = 0, $cmp46$i$i = 0, $cmp46$i38$i = 0, $cmp48$i = 0, $cmp49$i = 0, $cmp5 = 0;
 var $cmp51$i = 0, $cmp54$i$i = 0, $cmp55$i = 0, $cmp55$i185 = 0, $cmp57$i = 0, $cmp57$i$i = 0, $cmp57$i186 = 0, $cmp59$i$i = 0, $cmp60$i = 0, $cmp60$i$i = 0, $cmp62$i = 0, $cmp63$i = 0, $cmp63$i$i = 0, $cmp65$i = 0, $cmp66$i = 0, $cmp66$i189 = 0, $cmp69$i = 0, $cmp7$i$i = 0, $cmp70 = 0, $cmp72$i = 0;
 var $cmp75$i$i = 0, $cmp76 = 0, $cmp76$i = 0, $cmp79 = 0, $cmp81$i = 0, $cmp81$i$i = 0, $cmp81$i190 = 0, $cmp83$i$i = 0, $cmp85$i = 0, $cmp86$i$i = 0, $cmp89$i = 0, $cmp9$i$i = 0, $cmp90$i = 0, $cmp91$i = 0, $cmp93$i = 0, $cmp95$i = 0, $cmp96$i = 0, $cmp97$i = 0, $cmp97$i$i = 0, $cmp977$i = 0;
 var $cmp99 = 0, $cond = 0, $cond$i = 0, $cond$i$i = 0, $cond$i$i$i = 0, $cond$i150 = 0, $cond$i19$i = 0, $cond$i25$i = 0, $cond$i53$i = 0, $cond115$i$i = 0, $cond13$i$i = 0, $cond15$i$i = 0, $cond2$i$i = 0, $cond3$i = 0, $cond315$i$i = 0, $cond383$i = 0, $exitcond$i$i = 0, $fd$i = 0, $fd$i$i = 0, $fd$i161 = 0;
 var $fd103$i$i = 0, $fd123 = 0, $fd139$i = 0, $fd140$i$i = 0, $fd148$i$i = 0, $fd160$i$i = 0, $fd219$i = 0, $fd247$i$i = 0, $fd303$i$i = 0, $fd312$i = 0, $fd339$i$i = 0, $fd344$i$i = 0, $fd359$i$i = 0, $fd371$i = 0, $fd408$i = 0, $fd416$i = 0, $fd431$i = 0, $fd50$i = 0, $fd54$i$i = 0, $fd59$i$i = 0;
 var $fd68$pre$phi$i$iZ2D = 0, $fd69 = 0, $fd78$i$i = 0, $fd85$i$i = 0, $fd9 = 0, $head = 0, $head$i = 0, $head$i$i = 0, $head$i$i$i = 0, $head$i151 = 0, $head$i20$i = 0, $head$i31$i = 0, $head$i57$i = 0, $head118$i$i = 0, $head168 = 0, $head173 = 0, $head177 = 0, $head179 = 0, $head179$i = 0, $head182$i = 0;
 var $head187$i = 0, $head189$i = 0, $head195 = 0, $head198 = 0, $head208$i$i = 0, $head211$i$i = 0, $head23$i$i = 0, $head25 = 0, $head26$i$i = 0, $head265$i = 0, $head268$i = 0, $head271$i = 0, $head274$i = 0, $head279$i = 0, $head281$i = 0, $head29$i = 0, $head29$i$i = 0, $head317$i$i = 0, $head32$i$i = 0, $head34$i$i = 0;
 var $head386$i = 0, $head7$i$i = 0, $head7$i$i$i = 0, $head7$i59$i = 0, $head94 = 0, $head97 = 0, $head99$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $inc$i$i = 0, $index$i = 0, $index$i$i = 0, $index$i169 = 0, $index$i43$i = 0, $index288$i$i = 0, $index356$i = 0, $magic$i$i = 0, $nb$0 = 0, $neg = 0, $neg$i = 0;
 var $neg$i$i = 0, $neg$i170 = 0, $neg$i181 = 0, $neg103$i = 0, $neg13 = 0, $neg132$i$i = 0, $neg48$i = 0, $neg73 = 0, $next$i = 0, $next$i$i = 0, $next$i$i$i = 0, $next231$i = 0, $not$cmp$i = 0, $not$cmp107$i = 0, $not$cmp114$i = 0, $not$cmp141$i = 0, $not$cmp144$i$i = 0, $not$cmp150$i$i = 0, $not$cmp205$i = 0, $not$cmp346$i$i = 0;
 var $not$cmp4$i = 0, $not$cmp418$i = 0, $not$cmp494$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0, $or$cond$i187 = 0, $or$cond1$i = 0, $or$cond1$i183 = 0, $or$cond2$i = 0, $or$cond3$i = 0, $or$cond4$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond7$not$i = 0, $or$cond8$i = 0, $or$cond97$i = 0, $or$cond98$i = 0, $or$i = 0, $or$i$i = 0, $or$i$i$i = 0;
 var $or$i194 = 0, $or$i56$i = 0, $or101$i$i = 0, $or110 = 0, $or167 = 0, $or172 = 0, $or176 = 0, $or178$i = 0, $or180 = 0, $or183$i = 0, $or186$i = 0, $or188$i = 0, $or19$i$i = 0, $or194 = 0, $or197 = 0, $or204$i = 0, $or210$i$i = 0, $or22$i$i = 0, $or23 = 0, $or232$i$i = 0;
 var $or26 = 0, $or264$i = 0, $or267$i = 0, $or270$i = 0, $or275$i = 0, $or278$i = 0, $or28$i$i = 0, $or280$i = 0, $or297$i = 0, $or300$i$i = 0, $or33$i$i = 0, $or368$i = 0, $or40 = 0, $or44$i$i = 0, $or93 = 0, $or96 = 0, $parent$i = 0, $parent$i$i = 0, $parent$i159 = 0, $parent$i40$i = 0;
 var $parent135$i = 0, $parent138$i$i = 0, $parent149$i = 0, $parent162$i$i = 0, $parent165$i$i = 0, $parent166$i = 0, $parent179$i$i = 0, $parent196$i$i = 0, $parent226$i = 0, $parent240$i = 0, $parent257$i = 0, $parent301$i$i = 0, $parent337$i$i = 0, $parent361$i$i = 0, $parent369$i = 0, $parent406$i = 0, $parent433$i = 0, $qsize$0$i$i = 0, $retval$0 = 0, $rsize$0$i = 0;
 var $rsize$0$lcssa$i = 0, $rsize$08$i = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$49$i = 0, $rst$0$i = 0, $rst$1$i = 0, $sflags193$i = 0, $sflags235$i = 0, $shl = 0, $shl$i = 0, $shl$i$i = 0, $shl$i13$i = 0, $shl$i143 = 0, $shl$i36$i = 0, $shl102 = 0, $shl105 = 0, $shl116$i$i = 0, $shl12 = 0;
 var $shl127$i$i = 0, $shl131$i$i = 0, $shl15$i = 0, $shl18$i = 0, $shl192$i = 0, $shl195$i = 0, $shl198$i = 0, $shl22 = 0, $shl222$i$i = 0, $shl226$i$i = 0, $shl265$i$i = 0, $shl270$i$i = 0, $shl276$i$i = 0, $shl279$i$i = 0, $shl288$i = 0, $shl291$i = 0, $shl294$i$i = 0, $shl31$i = 0, $shl316$i$i = 0, $shl326$i$i = 0;
 var $shl333$i = 0, $shl338$i = 0, $shl344$i = 0, $shl347$i = 0, $shl35 = 0, $shl362$i = 0, $shl37 = 0, $shl384$i = 0, $shl39$i$i = 0, $shl395$i = 0, $shl48$i$i = 0, $shl52$i = 0, $shl60$i = 0, $shl65 = 0, $shl70$i$i = 0, $shl72 = 0, $shl75$i$i = 0, $shl81$i$i = 0, $shl84$i$i = 0, $shl9$i = 0;
 var $shl90 = 0, $shl95$i$i = 0, $shr = 0, $shr$i = 0, $shr$i$i = 0, $shr$i139 = 0, $shr$i34$i = 0, $shr101 = 0, $shr11$i = 0, $shr11$i146 = 0, $shr110$i$i = 0, $shr12$i = 0, $shr124$i$i = 0, $shr15$i = 0, $shr16$i = 0, $shr16$i147 = 0, $shr19$i = 0, $shr194$i = 0, $shr20$i = 0, $shr214$i$i = 0;
 var $shr253$i$i = 0, $shr263$i$i = 0, $shr267$i$i = 0, $shr27$i = 0, $shr272$i$i = 0, $shr277$i$i = 0, $shr281$i$i = 0, $shr283$i = 0, $shr3 = 0, $shr310$i$i = 0, $shr318$i = 0, $shr323$i$i = 0, $shr330$i = 0, $shr335$i = 0, $shr340$i = 0, $shr345$i = 0, $shr349$i = 0, $shr378$i = 0, $shr392$i = 0, $shr4$i = 0;
 var $shr42$i = 0, $shr45 = 0, $shr47 = 0, $shr48 = 0, $shr5$i = 0, $shr5$i141 = 0, $shr51 = 0, $shr52 = 0, $shr55 = 0, $shr56 = 0, $shr58$i$i = 0, $shr59 = 0, $shr60 = 0, $shr63 = 0, $shr68$i$i = 0, $shr7$i = 0, $shr7$i144 = 0, $shr72$i = 0, $shr72$i$i = 0, $shr75$i = 0;
 var $shr76$i = 0, $shr77$i$i = 0, $shr79$i = 0, $shr8$i = 0, $shr80$i = 0, $shr82$i$i = 0, $shr83$i = 0, $shr84$i = 0, $shr86$i$i = 0, $shr87$i = 0, $shr88$i = 0, $shr91$i = 0, $size$i$i = 0, $size$i$i$i = 0, $size188$i = 0, $size245$i = 0, $sizebits$0$i = 0, $sizebits$0$shl52$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0;
 var $sp$0108$i = 0, $sp$1107$i = 0, $ssize$2$ph$i = 0, $sub = 0, $sub$i = 0, $sub$i138 = 0, $sub$i180 = 0, $sub$ptr$lhs$cast$i = 0, $sub$ptr$lhs$cast$i$i = 0, $sub$ptr$lhs$cast$i28$i = 0, $sub$ptr$rhs$cast$i = 0, $sub$ptr$rhs$cast$i$i = 0, $sub$ptr$rhs$cast$i29$i = 0, $sub$ptr$sub$i = 0, $sub$ptr$sub$i$i = 0, $sub$ptr$sub$i30$i = 0, $sub$ptr$sub$tsize$4$i = 0, $sub10$i = 0, $sub101$i = 0, $sub101$rsize$4$i = 0;
 var $sub112$i = 0, $sub113$i$i = 0, $sub118$i = 0, $sub14$i = 0, $sub16$i$i = 0, $sub160 = 0, $sub172$i = 0, $sub18$i$i = 0, $sub190 = 0, $sub2$i = 0, $sub22$i = 0, $sub260$i = 0, $sub262$i$i = 0, $sub266$i$i = 0, $sub271$i$i = 0, $sub275$i$i = 0, $sub30$i = 0, $sub31$i = 0, $sub31$rsize$0$i = 0, $sub313$i$i = 0;
 var $sub329$i = 0, $sub33$i = 0, $sub334$i = 0, $sub339$i = 0, $sub343$i = 0, $sub381$i = 0, $sub4$i = 0, $sub41$i = 0, $sub42 = 0, $sub44 = 0, $sub5$i$i = 0, $sub5$i$i$i = 0, $sub5$i55$i = 0, $sub50$i = 0, $sub6$i = 0, $sub63$i = 0, $sub67$i = 0, $sub67$i$i = 0, $sub70$i = 0, $sub71$i$i = 0;
 var $sub76$i$i = 0, $sub80$i$i = 0, $sub91 = 0, $sub99$i = 0, $t$0$i = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$48$i = 0, $tbase$796$i = 0, $tobool$i$i = 0, $tobool107 = 0, $tobool195$i = 0, $tobool200$i = 0, $tobool228$i$i = 0, $tobool237$i = 0, $tobool293$i = 0, $tobool296$i$i = 0, $tobool30$i = 0, $tobool364$i = 0;
 var $tobool97$i$i = 0, $tsize$2657583$i = 0, $tsize$4$i = 0, $tsize$795$i = 0, $v$0$i = 0, $v$0$lcssa$i = 0, $v$09$i = 0, $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$4$ph$i = 0, $v$410$i = 0, $xor$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $magic$i$i = sp;
 $cmp = ($bytes>>>0)<(245);
 do {
  if ($cmp) {
   $cmp1 = ($bytes>>>0)<(11);
   $add2 = (($bytes) + 11)|0;
   $and = $add2 & -8;
   $cond = $cmp1 ? 16 : $and;
   $shr = $cond >>> 3;
   $0 = HEAP32[932]|0;
   $shr3 = $0 >>> $shr;
   $and4 = $shr3 & 3;
   $cmp5 = ($and4|0)==(0);
   if (!($cmp5)) {
    $neg = $shr3 & 1;
    $and7 = $neg ^ 1;
    $add8 = (($and7) + ($shr))|0;
    $shl = $add8 << 1;
    $arrayidx = (3768 + ($shl<<2)|0);
    $1 = ((($arrayidx)) + 8|0);
    $2 = HEAP32[$1>>2]|0;
    $fd9 = ((($2)) + 8|0);
    $3 = HEAP32[$fd9>>2]|0;
    $cmp10 = ($arrayidx|0)==($3|0);
    do {
     if ($cmp10) {
      $shl12 = 1 << $add8;
      $neg13 = $shl12 ^ -1;
      $and14 = $0 & $neg13;
      HEAP32[932] = $and14;
     } else {
      $4 = HEAP32[(3744)>>2]|0;
      $cmp15 = ($3>>>0)<($4>>>0);
      if ($cmp15) {
       _abort();
       // unreachable;
      }
      $bk = ((($3)) + 12|0);
      $5 = HEAP32[$bk>>2]|0;
      $cmp16 = ($5|0)==($2|0);
      if ($cmp16) {
       HEAP32[$bk>>2] = $arrayidx;
       HEAP32[$1>>2] = $3;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $shl22 = $add8 << 3;
    $or23 = $shl22 | 3;
    $head = ((($2)) + 4|0);
    HEAP32[$head>>2] = $or23;
    $add$ptr = (($2) + ($shl22)|0);
    $head25 = ((($add$ptr)) + 4|0);
    $6 = HEAP32[$head25>>2]|0;
    $or26 = $6 | 1;
    HEAP32[$head25>>2] = $or26;
    $retval$0 = $fd9;
    STACKTOP = sp;return ($retval$0|0);
   }
   $7 = HEAP32[(3736)>>2]|0;
   $cmp29 = ($cond>>>0)>($7>>>0);
   if ($cmp29) {
    $cmp31 = ($shr3|0)==(0);
    if (!($cmp31)) {
     $shl35 = $shr3 << $shr;
     $shl37 = 2 << $shr;
     $sub = (0 - ($shl37))|0;
     $or40 = $shl37 | $sub;
     $and41 = $shl35 & $or40;
     $sub42 = (0 - ($and41))|0;
     $and43 = $and41 & $sub42;
     $sub44 = (($and43) + -1)|0;
     $shr45 = $sub44 >>> 12;
     $and46 = $shr45 & 16;
     $shr47 = $sub44 >>> $and46;
     $shr48 = $shr47 >>> 5;
     $and49 = $shr48 & 8;
     $add50 = $and49 | $and46;
     $shr51 = $shr47 >>> $and49;
     $shr52 = $shr51 >>> 2;
     $and53 = $shr52 & 4;
     $add54 = $add50 | $and53;
     $shr55 = $shr51 >>> $and53;
     $shr56 = $shr55 >>> 1;
     $and57 = $shr56 & 2;
     $add58 = $add54 | $and57;
     $shr59 = $shr55 >>> $and57;
     $shr60 = $shr59 >>> 1;
     $and61 = $shr60 & 1;
     $add62 = $add58 | $and61;
     $shr63 = $shr59 >>> $and61;
     $add64 = (($add62) + ($shr63))|0;
     $shl65 = $add64 << 1;
     $arrayidx66 = (3768 + ($shl65<<2)|0);
     $8 = ((($arrayidx66)) + 8|0);
     $9 = HEAP32[$8>>2]|0;
     $fd69 = ((($9)) + 8|0);
     $10 = HEAP32[$fd69>>2]|0;
     $cmp70 = ($arrayidx66|0)==($10|0);
     do {
      if ($cmp70) {
       $shl72 = 1 << $add64;
       $neg73 = $shl72 ^ -1;
       $and74 = $0 & $neg73;
       HEAP32[932] = $and74;
       $14 = $and74;
      } else {
       $11 = HEAP32[(3744)>>2]|0;
       $cmp76 = ($10>>>0)<($11>>>0);
       if ($cmp76) {
        _abort();
        // unreachable;
       }
       $bk78 = ((($10)) + 12|0);
       $12 = HEAP32[$bk78>>2]|0;
       $cmp79 = ($12|0)==($9|0);
       if ($cmp79) {
        HEAP32[$bk78>>2] = $arrayidx66;
        HEAP32[$8>>2] = $10;
        $14 = $0;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $shl90 = $add64 << 3;
     $sub91 = (($shl90) - ($cond))|0;
     $or93 = $cond | 3;
     $head94 = ((($9)) + 4|0);
     HEAP32[$head94>>2] = $or93;
     $add$ptr95 = (($9) + ($cond)|0);
     $or96 = $sub91 | 1;
     $head97 = ((($add$ptr95)) + 4|0);
     HEAP32[$head97>>2] = $or96;
     $add$ptr98 = (($add$ptr95) + ($sub91)|0);
     HEAP32[$add$ptr98>>2] = $sub91;
     $cmp99 = ($7|0)==(0);
     if (!($cmp99)) {
      $13 = HEAP32[(3748)>>2]|0;
      $shr101 = $7 >>> 3;
      $shl102 = $shr101 << 1;
      $arrayidx103 = (3768 + ($shl102<<2)|0);
      $shl105 = 1 << $shr101;
      $and106 = $14 & $shl105;
      $tobool107 = ($and106|0)==(0);
      if ($tobool107) {
       $or110 = $14 | $shl105;
       HEAP32[932] = $or110;
       $$pre = ((($arrayidx103)) + 8|0);
       $$pre$phiZ2D = $$pre;$F104$0 = $arrayidx103;
      } else {
       $15 = ((($arrayidx103)) + 8|0);
       $16 = HEAP32[$15>>2]|0;
       $17 = HEAP32[(3744)>>2]|0;
       $cmp113 = ($16>>>0)<($17>>>0);
       if ($cmp113) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $15;$F104$0 = $16;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $13;
      $bk122 = ((($F104$0)) + 12|0);
      HEAP32[$bk122>>2] = $13;
      $fd123 = ((($13)) + 8|0);
      HEAP32[$fd123>>2] = $F104$0;
      $bk124 = ((($13)) + 12|0);
      HEAP32[$bk124>>2] = $arrayidx103;
     }
     HEAP32[(3736)>>2] = $sub91;
     HEAP32[(3748)>>2] = $add$ptr95;
     $retval$0 = $fd69;
     STACKTOP = sp;return ($retval$0|0);
    }
    $18 = HEAP32[(3732)>>2]|0;
    $cmp128 = ($18|0)==(0);
    if ($cmp128) {
     $nb$0 = $cond;
    } else {
     $sub$i = (0 - ($18))|0;
     $and$i = $18 & $sub$i;
     $sub2$i = (($and$i) + -1)|0;
     $shr$i = $sub2$i >>> 12;
     $and3$i = $shr$i & 16;
     $shr4$i = $sub2$i >>> $and3$i;
     $shr5$i = $shr4$i >>> 5;
     $and6$i = $shr5$i & 8;
     $add$i = $and6$i | $and3$i;
     $shr7$i = $shr4$i >>> $and6$i;
     $shr8$i = $shr7$i >>> 2;
     $and9$i = $shr8$i & 4;
     $add10$i = $add$i | $and9$i;
     $shr11$i = $shr7$i >>> $and9$i;
     $shr12$i = $shr11$i >>> 1;
     $and13$i = $shr12$i & 2;
     $add14$i = $add10$i | $and13$i;
     $shr15$i = $shr11$i >>> $and13$i;
     $shr16$i = $shr15$i >>> 1;
     $and17$i = $shr16$i & 1;
     $add18$i = $add14$i | $and17$i;
     $shr19$i = $shr15$i >>> $and17$i;
     $add20$i = (($add18$i) + ($shr19$i))|0;
     $arrayidx$i = (4032 + ($add20$i<<2)|0);
     $19 = HEAP32[$arrayidx$i>>2]|0;
     $head$i = ((($19)) + 4|0);
     $20 = HEAP32[$head$i>>2]|0;
     $and21$i = $20 & -8;
     $sub22$i = (($and21$i) - ($cond))|0;
     $arrayidx233$i = ((($19)) + 16|0);
     $21 = HEAP32[$arrayidx233$i>>2]|0;
     $not$cmp4$i = ($21|0)==(0|0);
     $$sink5$i = $not$cmp4$i&1;
     $arrayidx276$i = (((($19)) + 16|0) + ($$sink5$i<<2)|0);
     $22 = HEAP32[$arrayidx276$i>>2]|0;
     $cmp287$i = ($22|0)==(0|0);
     if ($cmp287$i) {
      $rsize$0$lcssa$i = $sub22$i;$v$0$lcssa$i = $19;
     } else {
      $23 = $22;$rsize$08$i = $sub22$i;$v$09$i = $19;
      while(1) {
       $head29$i = ((($23)) + 4|0);
       $24 = HEAP32[$head29$i>>2]|0;
       $and30$i = $24 & -8;
       $sub31$i = (($and30$i) - ($cond))|0;
       $cmp32$i = ($sub31$i>>>0)<($rsize$08$i>>>0);
       $sub31$rsize$0$i = $cmp32$i ? $sub31$i : $rsize$08$i;
       $$v$0$i = $cmp32$i ? $23 : $v$09$i;
       $arrayidx23$i = ((($23)) + 16|0);
       $25 = HEAP32[$arrayidx23$i>>2]|0;
       $not$cmp$i = ($25|0)==(0|0);
       $$sink$i = $not$cmp$i&1;
       $arrayidx27$i = (((($23)) + 16|0) + ($$sink$i<<2)|0);
       $26 = HEAP32[$arrayidx27$i>>2]|0;
       $cmp28$i = ($26|0)==(0|0);
       if ($cmp28$i) {
        $rsize$0$lcssa$i = $sub31$rsize$0$i;$v$0$lcssa$i = $$v$0$i;
        break;
       } else {
        $23 = $26;$rsize$08$i = $sub31$rsize$0$i;$v$09$i = $$v$0$i;
       }
      }
     }
     $27 = HEAP32[(3744)>>2]|0;
     $cmp33$i = ($v$0$lcssa$i>>>0)<($27>>>0);
     if ($cmp33$i) {
      _abort();
      // unreachable;
     }
     $add$ptr$i = (($v$0$lcssa$i) + ($cond)|0);
     $cmp35$i = ($v$0$lcssa$i>>>0)<($add$ptr$i>>>0);
     if (!($cmp35$i)) {
      _abort();
      // unreachable;
     }
     $parent$i = ((($v$0$lcssa$i)) + 24|0);
     $28 = HEAP32[$parent$i>>2]|0;
     $bk$i = ((($v$0$lcssa$i)) + 12|0);
     $29 = HEAP32[$bk$i>>2]|0;
     $cmp40$i = ($29|0)==($v$0$lcssa$i|0);
     do {
      if ($cmp40$i) {
       $arrayidx61$i = ((($v$0$lcssa$i)) + 20|0);
       $33 = HEAP32[$arrayidx61$i>>2]|0;
       $cmp62$i = ($33|0)==(0|0);
       if ($cmp62$i) {
        $arrayidx65$i = ((($v$0$lcssa$i)) + 16|0);
        $34 = HEAP32[$arrayidx65$i>>2]|0;
        $cmp66$i = ($34|0)==(0|0);
        if ($cmp66$i) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $34;$RP$1$i = $arrayidx65$i;
        }
       } else {
        $R$1$i = $33;$RP$1$i = $arrayidx61$i;
       }
       while(1) {
        $arrayidx71$i = ((($R$1$i)) + 20|0);
        $35 = HEAP32[$arrayidx71$i>>2]|0;
        $cmp72$i = ($35|0)==(0|0);
        if (!($cmp72$i)) {
         $R$1$i = $35;$RP$1$i = $arrayidx71$i;
         continue;
        }
        $arrayidx75$i = ((($R$1$i)) + 16|0);
        $36 = HEAP32[$arrayidx75$i>>2]|0;
        $cmp76$i = ($36|0)==(0|0);
        if ($cmp76$i) {
         break;
        } else {
         $R$1$i = $36;$RP$1$i = $arrayidx75$i;
        }
       }
       $cmp81$i = ($RP$1$i>>>0)<($27>>>0);
       if ($cmp81$i) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$RP$1$i>>2] = 0;
        $R$3$i = $R$1$i;
        break;
       }
      } else {
       $fd$i = ((($v$0$lcssa$i)) + 8|0);
       $30 = HEAP32[$fd$i>>2]|0;
       $cmp45$i = ($30>>>0)<($27>>>0);
       if ($cmp45$i) {
        _abort();
        // unreachable;
       }
       $bk47$i = ((($30)) + 12|0);
       $31 = HEAP32[$bk47$i>>2]|0;
       $cmp48$i = ($31|0)==($v$0$lcssa$i|0);
       if (!($cmp48$i)) {
        _abort();
        // unreachable;
       }
       $fd50$i = ((($29)) + 8|0);
       $32 = HEAP32[$fd50$i>>2]|0;
       $cmp51$i = ($32|0)==($v$0$lcssa$i|0);
       if ($cmp51$i) {
        HEAP32[$bk47$i>>2] = $29;
        HEAP32[$fd50$i>>2] = $30;
        $R$3$i = $29;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $cmp90$i = ($28|0)==(0|0);
     L73: do {
      if (!($cmp90$i)) {
       $index$i = ((($v$0$lcssa$i)) + 28|0);
       $37 = HEAP32[$index$i>>2]|0;
       $arrayidx94$i = (4032 + ($37<<2)|0);
       $38 = HEAP32[$arrayidx94$i>>2]|0;
       $cmp95$i = ($v$0$lcssa$i|0)==($38|0);
       do {
        if ($cmp95$i) {
         HEAP32[$arrayidx94$i>>2] = $R$3$i;
         $cond$i = ($R$3$i|0)==(0|0);
         if ($cond$i) {
          $shl$i = 1 << $37;
          $neg$i = $shl$i ^ -1;
          $and103$i = $18 & $neg$i;
          HEAP32[(3732)>>2] = $and103$i;
          break L73;
         }
        } else {
         $39 = HEAP32[(3744)>>2]|0;
         $cmp107$i = ($28>>>0)<($39>>>0);
         if ($cmp107$i) {
          _abort();
          // unreachable;
         } else {
          $arrayidx113$i = ((($28)) + 16|0);
          $40 = HEAP32[$arrayidx113$i>>2]|0;
          $not$cmp114$i = ($40|0)!=($v$0$lcssa$i|0);
          $$sink2$i = $not$cmp114$i&1;
          $arrayidx121$i = (((($28)) + 16|0) + ($$sink2$i<<2)|0);
          HEAP32[$arrayidx121$i>>2] = $R$3$i;
          $cmp126$i = ($R$3$i|0)==(0|0);
          if ($cmp126$i) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while(0);
       $41 = HEAP32[(3744)>>2]|0;
       $cmp130$i = ($R$3$i>>>0)<($41>>>0);
       if ($cmp130$i) {
        _abort();
        // unreachable;
       }
       $parent135$i = ((($R$3$i)) + 24|0);
       HEAP32[$parent135$i>>2] = $28;
       $arrayidx137$i = ((($v$0$lcssa$i)) + 16|0);
       $42 = HEAP32[$arrayidx137$i>>2]|0;
       $cmp138$i = ($42|0)==(0|0);
       do {
        if (!($cmp138$i)) {
         $cmp142$i = ($42>>>0)<($41>>>0);
         if ($cmp142$i) {
          _abort();
          // unreachable;
         } else {
          $arrayidx148$i = ((($R$3$i)) + 16|0);
          HEAP32[$arrayidx148$i>>2] = $42;
          $parent149$i = ((($42)) + 24|0);
          HEAP32[$parent149$i>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $arrayidx154$i = ((($v$0$lcssa$i)) + 20|0);
       $43 = HEAP32[$arrayidx154$i>>2]|0;
       $cmp155$i = ($43|0)==(0|0);
       if (!($cmp155$i)) {
        $44 = HEAP32[(3744)>>2]|0;
        $cmp159$i = ($43>>>0)<($44>>>0);
        if ($cmp159$i) {
         _abort();
         // unreachable;
        } else {
         $arrayidx165$i = ((($R$3$i)) + 20|0);
         HEAP32[$arrayidx165$i>>2] = $43;
         $parent166$i = ((($43)) + 24|0);
         HEAP32[$parent166$i>>2] = $R$3$i;
         break;
        }
       }
      }
     } while(0);
     $cmp174$i = ($rsize$0$lcssa$i>>>0)<(16);
     if ($cmp174$i) {
      $add177$i = (($rsize$0$lcssa$i) + ($cond))|0;
      $or178$i = $add177$i | 3;
      $head179$i = ((($v$0$lcssa$i)) + 4|0);
      HEAP32[$head179$i>>2] = $or178$i;
      $add$ptr181$i = (($v$0$lcssa$i) + ($add177$i)|0);
      $head182$i = ((($add$ptr181$i)) + 4|0);
      $45 = HEAP32[$head182$i>>2]|0;
      $or183$i = $45 | 1;
      HEAP32[$head182$i>>2] = $or183$i;
     } else {
      $or186$i = $cond | 3;
      $head187$i = ((($v$0$lcssa$i)) + 4|0);
      HEAP32[$head187$i>>2] = $or186$i;
      $or188$i = $rsize$0$lcssa$i | 1;
      $head189$i = ((($add$ptr$i)) + 4|0);
      HEAP32[$head189$i>>2] = $or188$i;
      $add$ptr190$i = (($add$ptr$i) + ($rsize$0$lcssa$i)|0);
      HEAP32[$add$ptr190$i>>2] = $rsize$0$lcssa$i;
      $cmp191$i = ($7|0)==(0);
      if (!($cmp191$i)) {
       $46 = HEAP32[(3748)>>2]|0;
       $shr194$i = $7 >>> 3;
       $shl195$i = $shr194$i << 1;
       $arrayidx196$i = (3768 + ($shl195$i<<2)|0);
       $shl198$i = 1 << $shr194$i;
       $and199$i = $0 & $shl198$i;
       $tobool200$i = ($and199$i|0)==(0);
       if ($tobool200$i) {
        $or204$i = $0 | $shl198$i;
        HEAP32[932] = $or204$i;
        $$pre$i = ((($arrayidx196$i)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F197$0$i = $arrayidx196$i;
       } else {
        $47 = ((($arrayidx196$i)) + 8|0);
        $48 = HEAP32[$47>>2]|0;
        $49 = HEAP32[(3744)>>2]|0;
        $cmp208$i = ($48>>>0)<($49>>>0);
        if ($cmp208$i) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $47;$F197$0$i = $48;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $46;
       $bk218$i = ((($F197$0$i)) + 12|0);
       HEAP32[$bk218$i>>2] = $46;
       $fd219$i = ((($46)) + 8|0);
       HEAP32[$fd219$i>>2] = $F197$0$i;
       $bk220$i = ((($46)) + 12|0);
       HEAP32[$bk220$i>>2] = $arrayidx196$i;
      }
      HEAP32[(3736)>>2] = $rsize$0$lcssa$i;
      HEAP32[(3748)>>2] = $add$ptr$i;
     }
     $add$ptr225$i = ((($v$0$lcssa$i)) + 8|0);
     $retval$0 = $add$ptr225$i;
     STACKTOP = sp;return ($retval$0|0);
    }
   } else {
    $nb$0 = $cond;
   }
  } else {
   $cmp139 = ($bytes>>>0)>(4294967231);
   if ($cmp139) {
    $nb$0 = -1;
   } else {
    $add144 = (($bytes) + 11)|0;
    $and145 = $add144 & -8;
    $50 = HEAP32[(3732)>>2]|0;
    $cmp146 = ($50|0)==(0);
    if ($cmp146) {
     $nb$0 = $and145;
    } else {
     $sub$i138 = (0 - ($and145))|0;
     $shr$i139 = $add144 >>> 8;
     $cmp$i = ($shr$i139|0)==(0);
     if ($cmp$i) {
      $idx$0$i = 0;
     } else {
      $cmp1$i = ($and145>>>0)>(16777215);
      if ($cmp1$i) {
       $idx$0$i = 31;
      } else {
       $sub4$i = (($shr$i139) + 1048320)|0;
       $shr5$i141 = $sub4$i >>> 16;
       $and$i142 = $shr5$i141 & 8;
       $shl$i143 = $shr$i139 << $and$i142;
       $sub6$i = (($shl$i143) + 520192)|0;
       $shr7$i144 = $sub6$i >>> 16;
       $and8$i = $shr7$i144 & 4;
       $add$i145 = $and8$i | $and$i142;
       $shl9$i = $shl$i143 << $and8$i;
       $sub10$i = (($shl9$i) + 245760)|0;
       $shr11$i146 = $sub10$i >>> 16;
       $and12$i = $shr11$i146 & 2;
       $add13$i = $add$i145 | $and12$i;
       $sub14$i = (14 - ($add13$i))|0;
       $shl15$i = $shl9$i << $and12$i;
       $shr16$i147 = $shl15$i >>> 15;
       $add17$i = (($sub14$i) + ($shr16$i147))|0;
       $shl18$i = $add17$i << 1;
       $add19$i = (($add17$i) + 7)|0;
       $shr20$i = $and145 >>> $add19$i;
       $and21$i148 = $shr20$i & 1;
       $add22$i = $and21$i148 | $shl18$i;
       $idx$0$i = $add22$i;
      }
     }
     $arrayidx$i149 = (4032 + ($idx$0$i<<2)|0);
     $51 = HEAP32[$arrayidx$i149>>2]|0;
     $cmp24$i = ($51|0)==(0|0);
     L117: do {
      if ($cmp24$i) {
       $rsize$3$i = $sub$i138;$t$2$i = 0;$v$3$i = 0;
       label = 81;
      } else {
       $cmp26$i = ($idx$0$i|0)==(31);
       $shr27$i = $idx$0$i >>> 1;
       $sub30$i = (25 - ($shr27$i))|0;
       $cond$i150 = $cmp26$i ? 0 : $sub30$i;
       $shl31$i = $and145 << $cond$i150;
       $rsize$0$i = $sub$i138;$rst$0$i = 0;$sizebits$0$i = $shl31$i;$t$0$i = $51;$v$0$i = 0;
       while(1) {
        $head$i151 = ((($t$0$i)) + 4|0);
        $52 = HEAP32[$head$i151>>2]|0;
        $and32$i = $52 & -8;
        $sub33$i = (($and32$i) - ($and145))|0;
        $cmp34$i = ($sub33$i>>>0)<($rsize$0$i>>>0);
        if ($cmp34$i) {
         $cmp36$i = ($sub33$i|0)==(0);
         if ($cmp36$i) {
          $rsize$49$i = 0;$t$48$i = $t$0$i;$v$410$i = $t$0$i;
          label = 85;
          break L117;
         } else {
          $rsize$1$i = $sub33$i;$v$1$i = $t$0$i;
         }
        } else {
         $rsize$1$i = $rsize$0$i;$v$1$i = $v$0$i;
        }
        $arrayidx40$i = ((($t$0$i)) + 20|0);
        $53 = HEAP32[$arrayidx40$i>>2]|0;
        $shr42$i = $sizebits$0$i >>> 31;
        $arrayidx44$i = (((($t$0$i)) + 16|0) + ($shr42$i<<2)|0);
        $54 = HEAP32[$arrayidx44$i>>2]|0;
        $cmp45$i152 = ($53|0)==(0|0);
        $cmp46$i = ($53|0)==($54|0);
        $or$cond1$i = $cmp45$i152 | $cmp46$i;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $53;
        $cmp49$i = ($54|0)==(0|0);
        $not$cmp494$i = $cmp49$i ^ 1;
        $shl52$i = $not$cmp494$i&1;
        $sizebits$0$shl52$i = $sizebits$0$i << $shl52$i;
        if ($cmp49$i) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 81;
         break;
        } else {
         $rsize$0$i = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$shl52$i;$t$0$i = $54;$v$0$i = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 81) {
      $cmp55$i = ($t$2$i|0)==(0|0);
      $cmp57$i = ($v$3$i|0)==(0|0);
      $or$cond$i = $cmp55$i & $cmp57$i;
      if ($or$cond$i) {
       $shl60$i = 2 << $idx$0$i;
       $sub63$i = (0 - ($shl60$i))|0;
       $or$i = $shl60$i | $sub63$i;
       $and64$i = $50 & $or$i;
       $cmp65$i = ($and64$i|0)==(0);
       if ($cmp65$i) {
        $nb$0 = $and145;
        break;
       }
       $sub67$i = (0 - ($and64$i))|0;
       $and68$i = $and64$i & $sub67$i;
       $sub70$i = (($and68$i) + -1)|0;
       $shr72$i = $sub70$i >>> 12;
       $and73$i = $shr72$i & 16;
       $shr75$i = $sub70$i >>> $and73$i;
       $shr76$i = $shr75$i >>> 5;
       $and77$i = $shr76$i & 8;
       $add78$i = $and77$i | $and73$i;
       $shr79$i = $shr75$i >>> $and77$i;
       $shr80$i = $shr79$i >>> 2;
       $and81$i = $shr80$i & 4;
       $add82$i = $add78$i | $and81$i;
       $shr83$i = $shr79$i >>> $and81$i;
       $shr84$i = $shr83$i >>> 1;
       $and85$i = $shr84$i & 2;
       $add86$i = $add82$i | $and85$i;
       $shr87$i = $shr83$i >>> $and85$i;
       $shr88$i = $shr87$i >>> 1;
       $and89$i = $shr88$i & 1;
       $add90$i = $add86$i | $and89$i;
       $shr91$i = $shr87$i >>> $and89$i;
       $add92$i = (($add90$i) + ($shr91$i))|0;
       $arrayidx94$i153 = (4032 + ($add92$i<<2)|0);
       $55 = HEAP32[$arrayidx94$i153>>2]|0;
       $t$4$ph$i = $55;$v$4$ph$i = 0;
      } else {
       $t$4$ph$i = $t$2$i;$v$4$ph$i = $v$3$i;
      }
      $cmp977$i = ($t$4$ph$i|0)==(0|0);
      if ($cmp977$i) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$4$ph$i;
      } else {
       $rsize$49$i = $rsize$3$i;$t$48$i = $t$4$ph$i;$v$410$i = $v$4$ph$i;
       label = 85;
      }
     }
     if ((label|0) == 85) {
      while(1) {
       label = 0;
       $head99$i = ((($t$48$i)) + 4|0);
       $56 = HEAP32[$head99$i>>2]|0;
       $and100$i = $56 & -8;
       $sub101$i = (($and100$i) - ($and145))|0;
       $cmp102$i = ($sub101$i>>>0)<($rsize$49$i>>>0);
       $sub101$rsize$4$i = $cmp102$i ? $sub101$i : $rsize$49$i;
       $t$4$v$4$i = $cmp102$i ? $t$48$i : $v$410$i;
       $arrayidx106$i = ((($t$48$i)) + 16|0);
       $57 = HEAP32[$arrayidx106$i>>2]|0;
       $not$cmp107$i = ($57|0)==(0|0);
       $$sink$i154 = $not$cmp107$i&1;
       $arrayidx113$i155 = (((($t$48$i)) + 16|0) + ($$sink$i154<<2)|0);
       $58 = HEAP32[$arrayidx113$i155>>2]|0;
       $cmp97$i = ($58|0)==(0|0);
       if ($cmp97$i) {
        $rsize$4$lcssa$i = $sub101$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$49$i = $sub101$rsize$4$i;$t$48$i = $58;$v$410$i = $t$4$v$4$i;
        label = 85;
       }
      }
     }
     $cmp116$i = ($v$4$lcssa$i|0)==(0|0);
     if ($cmp116$i) {
      $nb$0 = $and145;
     } else {
      $59 = HEAP32[(3736)>>2]|0;
      $sub118$i = (($59) - ($and145))|0;
      $cmp119$i = ($rsize$4$lcssa$i>>>0)<($sub118$i>>>0);
      if ($cmp119$i) {
       $60 = HEAP32[(3744)>>2]|0;
       $cmp121$i = ($v$4$lcssa$i>>>0)<($60>>>0);
       if ($cmp121$i) {
        _abort();
        // unreachable;
       }
       $add$ptr$i158 = (($v$4$lcssa$i) + ($and145)|0);
       $cmp123$i = ($v$4$lcssa$i>>>0)<($add$ptr$i158>>>0);
       if (!($cmp123$i)) {
        _abort();
        // unreachable;
       }
       $parent$i159 = ((($v$4$lcssa$i)) + 24|0);
       $61 = HEAP32[$parent$i159>>2]|0;
       $bk$i160 = ((($v$4$lcssa$i)) + 12|0);
       $62 = HEAP32[$bk$i160>>2]|0;
       $cmp128$i = ($62|0)==($v$4$lcssa$i|0);
       do {
        if ($cmp128$i) {
         $arrayidx151$i = ((($v$4$lcssa$i)) + 20|0);
         $66 = HEAP32[$arrayidx151$i>>2]|0;
         $cmp152$i = ($66|0)==(0|0);
         if ($cmp152$i) {
          $arrayidx155$i = ((($v$4$lcssa$i)) + 16|0);
          $67 = HEAP32[$arrayidx155$i>>2]|0;
          $cmp156$i = ($67|0)==(0|0);
          if ($cmp156$i) {
           $R$3$i168 = 0;
           break;
          } else {
           $R$1$i165 = $67;$RP$1$i164 = $arrayidx155$i;
          }
         } else {
          $R$1$i165 = $66;$RP$1$i164 = $arrayidx151$i;
         }
         while(1) {
          $arrayidx161$i = ((($R$1$i165)) + 20|0);
          $68 = HEAP32[$arrayidx161$i>>2]|0;
          $cmp162$i = ($68|0)==(0|0);
          if (!($cmp162$i)) {
           $R$1$i165 = $68;$RP$1$i164 = $arrayidx161$i;
           continue;
          }
          $arrayidx165$i166 = ((($R$1$i165)) + 16|0);
          $69 = HEAP32[$arrayidx165$i166>>2]|0;
          $cmp166$i = ($69|0)==(0|0);
          if ($cmp166$i) {
           break;
          } else {
           $R$1$i165 = $69;$RP$1$i164 = $arrayidx165$i166;
          }
         }
         $cmp171$i = ($RP$1$i164>>>0)<($60>>>0);
         if ($cmp171$i) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i164>>2] = 0;
          $R$3$i168 = $R$1$i165;
          break;
         }
        } else {
         $fd$i161 = ((($v$4$lcssa$i)) + 8|0);
         $63 = HEAP32[$fd$i161>>2]|0;
         $cmp133$i = ($63>>>0)<($60>>>0);
         if ($cmp133$i) {
          _abort();
          // unreachable;
         }
         $bk136$i = ((($63)) + 12|0);
         $64 = HEAP32[$bk136$i>>2]|0;
         $cmp137$i = ($64|0)==($v$4$lcssa$i|0);
         if (!($cmp137$i)) {
          _abort();
          // unreachable;
         }
         $fd139$i = ((($62)) + 8|0);
         $65 = HEAP32[$fd139$i>>2]|0;
         $cmp140$i = ($65|0)==($v$4$lcssa$i|0);
         if ($cmp140$i) {
          HEAP32[$bk136$i>>2] = $62;
          HEAP32[$fd139$i>>2] = $63;
          $R$3$i168 = $62;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $cmp180$i = ($61|0)==(0|0);
       L164: do {
        if ($cmp180$i) {
         $83 = $50;
        } else {
         $index$i169 = ((($v$4$lcssa$i)) + 28|0);
         $70 = HEAP32[$index$i169>>2]|0;
         $arrayidx184$i = (4032 + ($70<<2)|0);
         $71 = HEAP32[$arrayidx184$i>>2]|0;
         $cmp185$i = ($v$4$lcssa$i|0)==($71|0);
         do {
          if ($cmp185$i) {
           HEAP32[$arrayidx184$i>>2] = $R$3$i168;
           $cond3$i = ($R$3$i168|0)==(0|0);
           if ($cond3$i) {
            $shl192$i = 1 << $70;
            $neg$i170 = $shl192$i ^ -1;
            $and194$i = $50 & $neg$i170;
            HEAP32[(3732)>>2] = $and194$i;
            $83 = $and194$i;
            break L164;
           }
          } else {
           $72 = HEAP32[(3744)>>2]|0;
           $cmp198$i = ($61>>>0)<($72>>>0);
           if ($cmp198$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx204$i = ((($61)) + 16|0);
            $73 = HEAP32[$arrayidx204$i>>2]|0;
            $not$cmp205$i = ($73|0)!=($v$4$lcssa$i|0);
            $$sink2$i172 = $not$cmp205$i&1;
            $arrayidx212$i = (((($61)) + 16|0) + ($$sink2$i172<<2)|0);
            HEAP32[$arrayidx212$i>>2] = $R$3$i168;
            $cmp217$i = ($R$3$i168|0)==(0|0);
            if ($cmp217$i) {
             $83 = $50;
             break L164;
            } else {
             break;
            }
           }
          }
         } while(0);
         $74 = HEAP32[(3744)>>2]|0;
         $cmp221$i = ($R$3$i168>>>0)<($74>>>0);
         if ($cmp221$i) {
          _abort();
          // unreachable;
         }
         $parent226$i = ((($R$3$i168)) + 24|0);
         HEAP32[$parent226$i>>2] = $61;
         $arrayidx228$i = ((($v$4$lcssa$i)) + 16|0);
         $75 = HEAP32[$arrayidx228$i>>2]|0;
         $cmp229$i = ($75|0)==(0|0);
         do {
          if (!($cmp229$i)) {
           $cmp233$i = ($75>>>0)<($74>>>0);
           if ($cmp233$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx239$i = ((($R$3$i168)) + 16|0);
            HEAP32[$arrayidx239$i>>2] = $75;
            $parent240$i = ((($75)) + 24|0);
            HEAP32[$parent240$i>>2] = $R$3$i168;
            break;
           }
          }
         } while(0);
         $arrayidx245$i = ((($v$4$lcssa$i)) + 20|0);
         $76 = HEAP32[$arrayidx245$i>>2]|0;
         $cmp246$i = ($76|0)==(0|0);
         if ($cmp246$i) {
          $83 = $50;
         } else {
          $77 = HEAP32[(3744)>>2]|0;
          $cmp250$i = ($76>>>0)<($77>>>0);
          if ($cmp250$i) {
           _abort();
           // unreachable;
          } else {
           $arrayidx256$i = ((($R$3$i168)) + 20|0);
           HEAP32[$arrayidx256$i>>2] = $76;
           $parent257$i = ((($76)) + 24|0);
           HEAP32[$parent257$i>>2] = $R$3$i168;
           $83 = $50;
           break;
          }
         }
        }
       } while(0);
       $cmp265$i = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($cmp265$i) {
         $add268$i = (($rsize$4$lcssa$i) + ($and145))|0;
         $or270$i = $add268$i | 3;
         $head271$i = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$head271$i>>2] = $or270$i;
         $add$ptr273$i = (($v$4$lcssa$i) + ($add268$i)|0);
         $head274$i = ((($add$ptr273$i)) + 4|0);
         $78 = HEAP32[$head274$i>>2]|0;
         $or275$i = $78 | 1;
         HEAP32[$head274$i>>2] = $or275$i;
        } else {
         $or278$i = $and145 | 3;
         $head279$i = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$head279$i>>2] = $or278$i;
         $or280$i = $rsize$4$lcssa$i | 1;
         $head281$i = ((($add$ptr$i158)) + 4|0);
         HEAP32[$head281$i>>2] = $or280$i;
         $add$ptr282$i = (($add$ptr$i158) + ($rsize$4$lcssa$i)|0);
         HEAP32[$add$ptr282$i>>2] = $rsize$4$lcssa$i;
         $shr283$i = $rsize$4$lcssa$i >>> 3;
         $cmp284$i = ($rsize$4$lcssa$i>>>0)<(256);
         if ($cmp284$i) {
          $shl288$i = $shr283$i << 1;
          $arrayidx289$i = (3768 + ($shl288$i<<2)|0);
          $79 = HEAP32[932]|0;
          $shl291$i = 1 << $shr283$i;
          $and292$i = $79 & $shl291$i;
          $tobool293$i = ($and292$i|0)==(0);
          if ($tobool293$i) {
           $or297$i = $79 | $shl291$i;
           HEAP32[932] = $or297$i;
           $$pre$i175 = ((($arrayidx289$i)) + 8|0);
           $$pre$phi$i176Z2D = $$pre$i175;$F290$0$i = $arrayidx289$i;
          } else {
           $80 = ((($arrayidx289$i)) + 8|0);
           $81 = HEAP32[$80>>2]|0;
           $82 = HEAP32[(3744)>>2]|0;
           $cmp301$i = ($81>>>0)<($82>>>0);
           if ($cmp301$i) {
            _abort();
            // unreachable;
           } else {
            $$pre$phi$i176Z2D = $80;$F290$0$i = $81;
           }
          }
          HEAP32[$$pre$phi$i176Z2D>>2] = $add$ptr$i158;
          $bk311$i = ((($F290$0$i)) + 12|0);
          HEAP32[$bk311$i>>2] = $add$ptr$i158;
          $fd312$i = ((($add$ptr$i158)) + 8|0);
          HEAP32[$fd312$i>>2] = $F290$0$i;
          $bk313$i = ((($add$ptr$i158)) + 12|0);
          HEAP32[$bk313$i>>2] = $arrayidx289$i;
          break;
         }
         $shr318$i = $rsize$4$lcssa$i >>> 8;
         $cmp319$i = ($shr318$i|0)==(0);
         if ($cmp319$i) {
          $I316$0$i = 0;
         } else {
          $cmp323$i = ($rsize$4$lcssa$i>>>0)>(16777215);
          if ($cmp323$i) {
           $I316$0$i = 31;
          } else {
           $sub329$i = (($shr318$i) + 1048320)|0;
           $shr330$i = $sub329$i >>> 16;
           $and331$i = $shr330$i & 8;
           $shl333$i = $shr318$i << $and331$i;
           $sub334$i = (($shl333$i) + 520192)|0;
           $shr335$i = $sub334$i >>> 16;
           $and336$i = $shr335$i & 4;
           $add337$i = $and336$i | $and331$i;
           $shl338$i = $shl333$i << $and336$i;
           $sub339$i = (($shl338$i) + 245760)|0;
           $shr340$i = $sub339$i >>> 16;
           $and341$i = $shr340$i & 2;
           $add342$i = $add337$i | $and341$i;
           $sub343$i = (14 - ($add342$i))|0;
           $shl344$i = $shl338$i << $and341$i;
           $shr345$i = $shl344$i >>> 15;
           $add346$i = (($sub343$i) + ($shr345$i))|0;
           $shl347$i = $add346$i << 1;
           $add348$i = (($add346$i) + 7)|0;
           $shr349$i = $rsize$4$lcssa$i >>> $add348$i;
           $and350$i = $shr349$i & 1;
           $add351$i = $and350$i | $shl347$i;
           $I316$0$i = $add351$i;
          }
         }
         $arrayidx355$i = (4032 + ($I316$0$i<<2)|0);
         $index356$i = ((($add$ptr$i158)) + 28|0);
         HEAP32[$index356$i>>2] = $I316$0$i;
         $child357$i = ((($add$ptr$i158)) + 16|0);
         $arrayidx358$i = ((($child357$i)) + 4|0);
         HEAP32[$arrayidx358$i>>2] = 0;
         HEAP32[$child357$i>>2] = 0;
         $shl362$i = 1 << $I316$0$i;
         $and363$i = $83 & $shl362$i;
         $tobool364$i = ($and363$i|0)==(0);
         if ($tobool364$i) {
          $or368$i = $83 | $shl362$i;
          HEAP32[(3732)>>2] = $or368$i;
          HEAP32[$arrayidx355$i>>2] = $add$ptr$i158;
          $parent369$i = ((($add$ptr$i158)) + 24|0);
          HEAP32[$parent369$i>>2] = $arrayidx355$i;
          $bk370$i = ((($add$ptr$i158)) + 12|0);
          HEAP32[$bk370$i>>2] = $add$ptr$i158;
          $fd371$i = ((($add$ptr$i158)) + 8|0);
          HEAP32[$fd371$i>>2] = $add$ptr$i158;
          break;
         }
         $84 = HEAP32[$arrayidx355$i>>2]|0;
         $cmp374$i = ($I316$0$i|0)==(31);
         $shr378$i = $I316$0$i >>> 1;
         $sub381$i = (25 - ($shr378$i))|0;
         $cond383$i = $cmp374$i ? 0 : $sub381$i;
         $shl384$i = $rsize$4$lcssa$i << $cond383$i;
         $K373$0$i = $shl384$i;$T$0$i = $84;
         while(1) {
          $head386$i = ((($T$0$i)) + 4|0);
          $85 = HEAP32[$head386$i>>2]|0;
          $and387$i = $85 & -8;
          $cmp388$i = ($and387$i|0)==($rsize$4$lcssa$i|0);
          if ($cmp388$i) {
           label = 139;
           break;
          }
          $shr392$i = $K373$0$i >>> 31;
          $arrayidx394$i = (((($T$0$i)) + 16|0) + ($shr392$i<<2)|0);
          $shl395$i = $K373$0$i << 1;
          $86 = HEAP32[$arrayidx394$i>>2]|0;
          $cmp396$i = ($86|0)==(0|0);
          if ($cmp396$i) {
           label = 136;
           break;
          } else {
           $K373$0$i = $shl395$i;$T$0$i = $86;
          }
         }
         if ((label|0) == 136) {
          $87 = HEAP32[(3744)>>2]|0;
          $cmp401$i = ($arrayidx394$i>>>0)<($87>>>0);
          if ($cmp401$i) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$arrayidx394$i>>2] = $add$ptr$i158;
           $parent406$i = ((($add$ptr$i158)) + 24|0);
           HEAP32[$parent406$i>>2] = $T$0$i;
           $bk407$i = ((($add$ptr$i158)) + 12|0);
           HEAP32[$bk407$i>>2] = $add$ptr$i158;
           $fd408$i = ((($add$ptr$i158)) + 8|0);
           HEAP32[$fd408$i>>2] = $add$ptr$i158;
           break;
          }
         }
         else if ((label|0) == 139) {
          $fd416$i = ((($T$0$i)) + 8|0);
          $88 = HEAP32[$fd416$i>>2]|0;
          $89 = HEAP32[(3744)>>2]|0;
          $cmp422$i = ($88>>>0)>=($89>>>0);
          $not$cmp418$i = ($T$0$i>>>0)>=($89>>>0);
          $90 = $cmp422$i & $not$cmp418$i;
          if ($90) {
           $bk429$i = ((($88)) + 12|0);
           HEAP32[$bk429$i>>2] = $add$ptr$i158;
           HEAP32[$fd416$i>>2] = $add$ptr$i158;
           $fd431$i = ((($add$ptr$i158)) + 8|0);
           HEAP32[$fd431$i>>2] = $88;
           $bk432$i = ((($add$ptr$i158)) + 12|0);
           HEAP32[$bk432$i>>2] = $T$0$i;
           $parent433$i = ((($add$ptr$i158)) + 24|0);
           HEAP32[$parent433$i>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $add$ptr441$i = ((($v$4$lcssa$i)) + 8|0);
       $retval$0 = $add$ptr441$i;
       STACKTOP = sp;return ($retval$0|0);
      } else {
       $nb$0 = $and145;
      }
     }
    }
   }
  }
 } while(0);
 $91 = HEAP32[(3736)>>2]|0;
 $cmp156 = ($91>>>0)<($nb$0>>>0);
 if (!($cmp156)) {
  $sub160 = (($91) - ($nb$0))|0;
  $92 = HEAP32[(3748)>>2]|0;
  $cmp162 = ($sub160>>>0)>(15);
  if ($cmp162) {
   $add$ptr166 = (($92) + ($nb$0)|0);
   HEAP32[(3748)>>2] = $add$ptr166;
   HEAP32[(3736)>>2] = $sub160;
   $or167 = $sub160 | 1;
   $head168 = ((($add$ptr166)) + 4|0);
   HEAP32[$head168>>2] = $or167;
   $add$ptr169 = (($add$ptr166) + ($sub160)|0);
   HEAP32[$add$ptr169>>2] = $sub160;
   $or172 = $nb$0 | 3;
   $head173 = ((($92)) + 4|0);
   HEAP32[$head173>>2] = $or172;
  } else {
   HEAP32[(3736)>>2] = 0;
   HEAP32[(3748)>>2] = 0;
   $or176 = $91 | 3;
   $head177 = ((($92)) + 4|0);
   HEAP32[$head177>>2] = $or176;
   $add$ptr178 = (($92) + ($91)|0);
   $head179 = ((($add$ptr178)) + 4|0);
   $93 = HEAP32[$head179>>2]|0;
   $or180 = $93 | 1;
   HEAP32[$head179>>2] = $or180;
  }
  $add$ptr182 = ((($92)) + 8|0);
  $retval$0 = $add$ptr182;
  STACKTOP = sp;return ($retval$0|0);
 }
 $94 = HEAP32[(3740)>>2]|0;
 $cmp186 = ($94>>>0)>($nb$0>>>0);
 if ($cmp186) {
  $sub190 = (($94) - ($nb$0))|0;
  HEAP32[(3740)>>2] = $sub190;
  $95 = HEAP32[(3752)>>2]|0;
  $add$ptr193 = (($95) + ($nb$0)|0);
  HEAP32[(3752)>>2] = $add$ptr193;
  $or194 = $sub190 | 1;
  $head195 = ((($add$ptr193)) + 4|0);
  HEAP32[$head195>>2] = $or194;
  $or197 = $nb$0 | 3;
  $head198 = ((($95)) + 4|0);
  HEAP32[$head198>>2] = $or197;
  $add$ptr199 = ((($95)) + 8|0);
  $retval$0 = $add$ptr199;
  STACKTOP = sp;return ($retval$0|0);
 }
 $96 = HEAP32[1050]|0;
 $cmp$i177 = ($96|0)==(0);
 if ($cmp$i177) {
  HEAP32[(4208)>>2] = 4096;
  HEAP32[(4204)>>2] = 4096;
  HEAP32[(4212)>>2] = -1;
  HEAP32[(4216)>>2] = -1;
  HEAP32[(4220)>>2] = 0;
  HEAP32[(4172)>>2] = 0;
  $97 = $magic$i$i;
  $xor$i$i = $97 & -16;
  $and6$i$i = $xor$i$i ^ 1431655768;
  HEAP32[$magic$i$i>>2] = $and6$i$i;
  HEAP32[1050] = $and6$i$i;
  $98 = 4096;
 } else {
  $$pre$i178 = HEAP32[(4208)>>2]|0;
  $98 = $$pre$i178;
 }
 $add$i179 = (($nb$0) + 48)|0;
 $sub$i180 = (($nb$0) + 47)|0;
 $add9$i = (($98) + ($sub$i180))|0;
 $neg$i181 = (0 - ($98))|0;
 $and11$i = $add9$i & $neg$i181;
 $cmp12$i = ($and11$i>>>0)>($nb$0>>>0);
 if (!($cmp12$i)) {
  $retval$0 = 0;
  STACKTOP = sp;return ($retval$0|0);
 }
 $99 = HEAP32[(4168)>>2]|0;
 $cmp15$i = ($99|0)==(0);
 if (!($cmp15$i)) {
  $100 = HEAP32[(4160)>>2]|0;
  $add17$i182 = (($100) + ($and11$i))|0;
  $cmp19$i = ($add17$i182>>>0)<=($100>>>0);
  $cmp21$i = ($add17$i182>>>0)>($99>>>0);
  $or$cond1$i183 = $cmp19$i | $cmp21$i;
  if ($or$cond1$i183) {
   $retval$0 = 0;
   STACKTOP = sp;return ($retval$0|0);
  }
 }
 $101 = HEAP32[(4172)>>2]|0;
 $and29$i = $101 & 4;
 $tobool30$i = ($and29$i|0)==(0);
 L244: do {
  if ($tobool30$i) {
   $102 = HEAP32[(3752)>>2]|0;
   $cmp32$i184 = ($102|0)==(0|0);
   L246: do {
    if ($cmp32$i184) {
     label = 163;
    } else {
     $sp$0$i$i = (4176);
     while(1) {
      $103 = HEAP32[$sp$0$i$i>>2]|0;
      $cmp$i11$i = ($103>>>0)>($102>>>0);
      if (!($cmp$i11$i)) {
       $size$i$i = ((($sp$0$i$i)) + 4|0);
       $104 = HEAP32[$size$i$i>>2]|0;
       $add$ptr$i$i = (($103) + ($104)|0);
       $cmp2$i$i = ($add$ptr$i$i>>>0)>($102>>>0);
       if ($cmp2$i$i) {
        break;
       }
      }
      $next$i$i = ((($sp$0$i$i)) + 8|0);
      $105 = HEAP32[$next$i$i>>2]|0;
      $cmp3$i$i = ($105|0)==(0|0);
      if ($cmp3$i$i) {
       label = 163;
       break L246;
      } else {
       $sp$0$i$i = $105;
      }
     }
     $add77$i = (($add9$i) - ($94))|0;
     $and80$i = $add77$i & $neg$i181;
     $cmp81$i190 = ($and80$i>>>0)<(2147483647);
     if ($cmp81$i190) {
      $call83$i = (_sbrk(($and80$i|0))|0);
      $110 = HEAP32[$sp$0$i$i>>2]|0;
      $111 = HEAP32[$size$i$i>>2]|0;
      $add$ptr$i192 = (($110) + ($111)|0);
      $cmp85$i = ($call83$i|0)==($add$ptr$i192|0);
      if ($cmp85$i) {
       $cmp89$i = ($call83$i|0)==((-1)|0);
       if ($cmp89$i) {
        $tsize$2657583$i = $and80$i;
       } else {
        $tbase$796$i = $call83$i;$tsize$795$i = $and80$i;
        label = 180;
        break L244;
       }
      } else {
       $br$2$ph$i = $call83$i;$ssize$2$ph$i = $and80$i;
       label = 171;
      }
     } else {
      $tsize$2657583$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 163) {
     $call37$i = (_sbrk(0)|0);
     $cmp38$i = ($call37$i|0)==((-1)|0);
     if ($cmp38$i) {
      $tsize$2657583$i = 0;
     } else {
      $106 = $call37$i;
      $107 = HEAP32[(4204)>>2]|0;
      $sub41$i = (($107) + -1)|0;
      $and42$i = $sub41$i & $106;
      $cmp43$i = ($and42$i|0)==(0);
      $add46$i = (($sub41$i) + ($106))|0;
      $neg48$i = (0 - ($107))|0;
      $and49$i = $add46$i & $neg48$i;
      $sub50$i = (($and49$i) - ($106))|0;
      $add51$i = $cmp43$i ? 0 : $sub50$i;
      $and11$add51$i = (($add51$i) + ($and11$i))|0;
      $108 = HEAP32[(4160)>>2]|0;
      $add54$i = (($and11$add51$i) + ($108))|0;
      $cmp55$i185 = ($and11$add51$i>>>0)>($nb$0>>>0);
      $cmp57$i186 = ($and11$add51$i>>>0)<(2147483647);
      $or$cond$i187 = $cmp55$i185 & $cmp57$i186;
      if ($or$cond$i187) {
       $109 = HEAP32[(4168)>>2]|0;
       $cmp60$i = ($109|0)==(0);
       if (!($cmp60$i)) {
        $cmp63$i = ($add54$i>>>0)<=($108>>>0);
        $cmp66$i189 = ($add54$i>>>0)>($109>>>0);
        $or$cond2$i = $cmp63$i | $cmp66$i189;
        if ($or$cond2$i) {
         $tsize$2657583$i = 0;
         break;
        }
       }
       $call68$i = (_sbrk(($and11$add51$i|0))|0);
       $cmp69$i = ($call68$i|0)==($call37$i|0);
       if ($cmp69$i) {
        $tbase$796$i = $call37$i;$tsize$795$i = $and11$add51$i;
        label = 180;
        break L244;
       } else {
        $br$2$ph$i = $call68$i;$ssize$2$ph$i = $and11$add51$i;
        label = 171;
       }
      } else {
       $tsize$2657583$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 171) {
     $sub112$i = (0 - ($ssize$2$ph$i))|0;
     $cmp91$i = ($br$2$ph$i|0)!=((-1)|0);
     $cmp93$i = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond5$i = $cmp93$i & $cmp91$i;
     $cmp96$i = ($add$i179>>>0)>($ssize$2$ph$i>>>0);
     $or$cond3$i = $cmp96$i & $or$cond5$i;
     if (!($or$cond3$i)) {
      $cmp118$i = ($br$2$ph$i|0)==((-1)|0);
      if ($cmp118$i) {
       $tsize$2657583$i = 0;
       break;
      } else {
       $tbase$796$i = $br$2$ph$i;$tsize$795$i = $ssize$2$ph$i;
       label = 180;
       break L244;
      }
     }
     $112 = HEAP32[(4208)>>2]|0;
     $sub99$i = (($sub$i180) - ($ssize$2$ph$i))|0;
     $add101$i = (($sub99$i) + ($112))|0;
     $neg103$i = (0 - ($112))|0;
     $and104$i = $add101$i & $neg103$i;
     $cmp105$i = ($and104$i>>>0)<(2147483647);
     if (!($cmp105$i)) {
      $tbase$796$i = $br$2$ph$i;$tsize$795$i = $ssize$2$ph$i;
      label = 180;
      break L244;
     }
     $call107$i = (_sbrk(($and104$i|0))|0);
     $cmp108$i = ($call107$i|0)==((-1)|0);
     if ($cmp108$i) {
      (_sbrk(($sub112$i|0))|0);
      $tsize$2657583$i = 0;
      break;
     } else {
      $add110$i = (($and104$i) + ($ssize$2$ph$i))|0;
      $tbase$796$i = $br$2$ph$i;$tsize$795$i = $add110$i;
      label = 180;
      break L244;
     }
    }
   } while(0);
   $113 = HEAP32[(4172)>>2]|0;
   $or$i194 = $113 | 4;
   HEAP32[(4172)>>2] = $or$i194;
   $tsize$4$i = $tsize$2657583$i;
   label = 178;
  } else {
   $tsize$4$i = 0;
   label = 178;
  }
 } while(0);
 if ((label|0) == 178) {
  $cmp127$i = ($and11$i>>>0)<(2147483647);
  if ($cmp127$i) {
   $call131$i = (_sbrk(($and11$i|0))|0);
   $call132$i = (_sbrk(0)|0);
   $cmp133$i195 = ($call131$i|0)!=((-1)|0);
   $cmp135$i = ($call132$i|0)!=((-1)|0);
   $or$cond4$i = $cmp133$i195 & $cmp135$i;
   $cmp137$i196 = ($call131$i>>>0)<($call132$i>>>0);
   $or$cond7$i = $cmp137$i196 & $or$cond4$i;
   $sub$ptr$lhs$cast$i = $call132$i;
   $sub$ptr$rhs$cast$i = $call131$i;
   $sub$ptr$sub$i = (($sub$ptr$lhs$cast$i) - ($sub$ptr$rhs$cast$i))|0;
   $add140$i = (($nb$0) + 40)|0;
   $cmp141$i = ($sub$ptr$sub$i>>>0)>($add140$i>>>0);
   $sub$ptr$sub$tsize$4$i = $cmp141$i ? $sub$ptr$sub$i : $tsize$4$i;
   $or$cond7$not$i = $or$cond7$i ^ 1;
   $cmp14799$i = ($call131$i|0)==((-1)|0);
   $not$cmp141$i = $cmp141$i ^ 1;
   $cmp147$i = $cmp14799$i | $not$cmp141$i;
   $or$cond97$i = $cmp147$i | $or$cond7$not$i;
   if (!($or$cond97$i)) {
    $tbase$796$i = $call131$i;$tsize$795$i = $sub$ptr$sub$tsize$4$i;
    label = 180;
   }
  }
 }
 if ((label|0) == 180) {
  $114 = HEAP32[(4160)>>2]|0;
  $add150$i = (($114) + ($tsize$795$i))|0;
  HEAP32[(4160)>>2] = $add150$i;
  $115 = HEAP32[(4164)>>2]|0;
  $cmp151$i = ($add150$i>>>0)>($115>>>0);
  if ($cmp151$i) {
   HEAP32[(4164)>>2] = $add150$i;
  }
  $116 = HEAP32[(3752)>>2]|0;
  $cmp157$i = ($116|0)==(0|0);
  do {
   if ($cmp157$i) {
    $117 = HEAP32[(3744)>>2]|0;
    $cmp159$i198 = ($117|0)==(0|0);
    $cmp162$i199 = ($tbase$796$i>>>0)<($117>>>0);
    $or$cond8$i = $cmp159$i198 | $cmp162$i199;
    if ($or$cond8$i) {
     HEAP32[(3744)>>2] = $tbase$796$i;
    }
    HEAP32[(4176)>>2] = $tbase$796$i;
    HEAP32[(4180)>>2] = $tsize$795$i;
    HEAP32[(4188)>>2] = 0;
    $118 = HEAP32[1050]|0;
    HEAP32[(3764)>>2] = $118;
    HEAP32[(3760)>>2] = -1;
    $i$01$i$i = 0;
    while(1) {
     $shl$i13$i = $i$01$i$i << 1;
     $arrayidx$i14$i = (3768 + ($shl$i13$i<<2)|0);
     $119 = ((($arrayidx$i14$i)) + 12|0);
     HEAP32[$119>>2] = $arrayidx$i14$i;
     $120 = ((($arrayidx$i14$i)) + 8|0);
     HEAP32[$120>>2] = $arrayidx$i14$i;
     $inc$i$i = (($i$01$i$i) + 1)|0;
     $exitcond$i$i = ($inc$i$i|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $i$01$i$i = $inc$i$i;
     }
    }
    $sub172$i = (($tsize$795$i) + -40)|0;
    $add$ptr$i16$i = ((($tbase$796$i)) + 8|0);
    $121 = $add$ptr$i16$i;
    $and$i17$i = $121 & 7;
    $cmp$i18$i = ($and$i17$i|0)==(0);
    $122 = (0 - ($121))|0;
    $and3$i$i = $122 & 7;
    $cond$i19$i = $cmp$i18$i ? 0 : $and3$i$i;
    $add$ptr4$i$i = (($tbase$796$i) + ($cond$i19$i)|0);
    $sub5$i$i = (($sub172$i) - ($cond$i19$i))|0;
    HEAP32[(3752)>>2] = $add$ptr4$i$i;
    HEAP32[(3740)>>2] = $sub5$i$i;
    $or$i$i = $sub5$i$i | 1;
    $head$i20$i = ((($add$ptr4$i$i)) + 4|0);
    HEAP32[$head$i20$i>>2] = $or$i$i;
    $add$ptr6$i$i = (($add$ptr4$i$i) + ($sub5$i$i)|0);
    $head7$i$i = ((($add$ptr6$i$i)) + 4|0);
    HEAP32[$head7$i$i>>2] = 40;
    $123 = HEAP32[(4216)>>2]|0;
    HEAP32[(3756)>>2] = $123;
   } else {
    $sp$0108$i = (4176);
    while(1) {
     $124 = HEAP32[$sp$0108$i>>2]|0;
     $size188$i = ((($sp$0108$i)) + 4|0);
     $125 = HEAP32[$size188$i>>2]|0;
     $add$ptr189$i = (($124) + ($125)|0);
     $cmp190$i = ($tbase$796$i|0)==($add$ptr189$i|0);
     if ($cmp190$i) {
      label = 190;
      break;
     }
     $next$i = ((($sp$0108$i)) + 8|0);
     $126 = HEAP32[$next$i>>2]|0;
     $cmp186$i = ($126|0)==(0|0);
     if ($cmp186$i) {
      break;
     } else {
      $sp$0108$i = $126;
     }
    }
    if ((label|0) == 190) {
     $sflags193$i = ((($sp$0108$i)) + 12|0);
     $127 = HEAP32[$sflags193$i>>2]|0;
     $and194$i203 = $127 & 8;
     $tobool195$i = ($and194$i203|0)==(0);
     if ($tobool195$i) {
      $cmp203$i = ($116>>>0)>=($124>>>0);
      $cmp209$i = ($116>>>0)<($tbase$796$i>>>0);
      $or$cond98$i = $cmp209$i & $cmp203$i;
      if ($or$cond98$i) {
       $add212$i = (($125) + ($tsize$795$i))|0;
       HEAP32[$size188$i>>2] = $add212$i;
       $128 = HEAP32[(3740)>>2]|0;
       $add$ptr$i49$i = ((($116)) + 8|0);
       $129 = $add$ptr$i49$i;
       $and$i50$i = $129 & 7;
       $cmp$i51$i = ($and$i50$i|0)==(0);
       $130 = (0 - ($129))|0;
       $and3$i52$i = $130 & 7;
       $cond$i53$i = $cmp$i51$i ? 0 : $and3$i52$i;
       $add$ptr4$i54$i = (($116) + ($cond$i53$i)|0);
       $add215$i = (($tsize$795$i) - ($cond$i53$i))|0;
       $sub5$i55$i = (($128) + ($add215$i))|0;
       HEAP32[(3752)>>2] = $add$ptr4$i54$i;
       HEAP32[(3740)>>2] = $sub5$i55$i;
       $or$i56$i = $sub5$i55$i | 1;
       $head$i57$i = ((($add$ptr4$i54$i)) + 4|0);
       HEAP32[$head$i57$i>>2] = $or$i56$i;
       $add$ptr6$i58$i = (($add$ptr4$i54$i) + ($sub5$i55$i)|0);
       $head7$i59$i = ((($add$ptr6$i58$i)) + 4|0);
       HEAP32[$head7$i59$i>>2] = 40;
       $131 = HEAP32[(4216)>>2]|0;
       HEAP32[(3756)>>2] = $131;
       break;
      }
     }
    }
    $132 = HEAP32[(3744)>>2]|0;
    $cmp218$i = ($tbase$796$i>>>0)<($132>>>0);
    if ($cmp218$i) {
     HEAP32[(3744)>>2] = $tbase$796$i;
     $147 = $tbase$796$i;
    } else {
     $147 = $132;
    }
    $add$ptr227$i = (($tbase$796$i) + ($tsize$795$i)|0);
    $sp$1107$i = (4176);
    while(1) {
     $133 = HEAP32[$sp$1107$i>>2]|0;
     $cmp228$i = ($133|0)==($add$ptr227$i|0);
     if ($cmp228$i) {
      label = 198;
      break;
     }
     $next231$i = ((($sp$1107$i)) + 8|0);
     $134 = HEAP32[$next231$i>>2]|0;
     $cmp224$i = ($134|0)==(0|0);
     if ($cmp224$i) {
      break;
     } else {
      $sp$1107$i = $134;
     }
    }
    if ((label|0) == 198) {
     $sflags235$i = ((($sp$1107$i)) + 12|0);
     $135 = HEAP32[$sflags235$i>>2]|0;
     $and236$i = $135 & 8;
     $tobool237$i = ($and236$i|0)==(0);
     if ($tobool237$i) {
      HEAP32[$sp$1107$i>>2] = $tbase$796$i;
      $size245$i = ((($sp$1107$i)) + 4|0);
      $136 = HEAP32[$size245$i>>2]|0;
      $add246$i = (($136) + ($tsize$795$i))|0;
      HEAP32[$size245$i>>2] = $add246$i;
      $add$ptr$i21$i = ((($tbase$796$i)) + 8|0);
      $137 = $add$ptr$i21$i;
      $and$i22$i = $137 & 7;
      $cmp$i23$i = ($and$i22$i|0)==(0);
      $138 = (0 - ($137))|0;
      $and3$i24$i = $138 & 7;
      $cond$i25$i = $cmp$i23$i ? 0 : $and3$i24$i;
      $add$ptr4$i26$i = (($tbase$796$i) + ($cond$i25$i)|0);
      $add$ptr5$i$i = ((($add$ptr227$i)) + 8|0);
      $139 = $add$ptr5$i$i;
      $and6$i27$i = $139 & 7;
      $cmp7$i$i = ($and6$i27$i|0)==(0);
      $140 = (0 - ($139))|0;
      $and13$i$i = $140 & 7;
      $cond15$i$i = $cmp7$i$i ? 0 : $and13$i$i;
      $add$ptr16$i$i = (($add$ptr227$i) + ($cond15$i$i)|0);
      $sub$ptr$lhs$cast$i28$i = $add$ptr16$i$i;
      $sub$ptr$rhs$cast$i29$i = $add$ptr4$i26$i;
      $sub$ptr$sub$i30$i = (($sub$ptr$lhs$cast$i28$i) - ($sub$ptr$rhs$cast$i29$i))|0;
      $add$ptr17$i$i = (($add$ptr4$i26$i) + ($nb$0)|0);
      $sub18$i$i = (($sub$ptr$sub$i30$i) - ($nb$0))|0;
      $or19$i$i = $nb$0 | 3;
      $head$i31$i = ((($add$ptr4$i26$i)) + 4|0);
      HEAP32[$head$i31$i>>2] = $or19$i$i;
      $cmp20$i$i = ($add$ptr16$i$i|0)==($116|0);
      do {
       if ($cmp20$i$i) {
        $141 = HEAP32[(3740)>>2]|0;
        $add$i$i = (($141) + ($sub18$i$i))|0;
        HEAP32[(3740)>>2] = $add$i$i;
        HEAP32[(3752)>>2] = $add$ptr17$i$i;
        $or22$i$i = $add$i$i | 1;
        $head23$i$i = ((($add$ptr17$i$i)) + 4|0);
        HEAP32[$head23$i$i>>2] = $or22$i$i;
       } else {
        $142 = HEAP32[(3748)>>2]|0;
        $cmp24$i$i = ($add$ptr16$i$i|0)==($142|0);
        if ($cmp24$i$i) {
         $143 = HEAP32[(3736)>>2]|0;
         $add26$i$i = (($143) + ($sub18$i$i))|0;
         HEAP32[(3736)>>2] = $add26$i$i;
         HEAP32[(3748)>>2] = $add$ptr17$i$i;
         $or28$i$i = $add26$i$i | 1;
         $head29$i$i = ((($add$ptr17$i$i)) + 4|0);
         HEAP32[$head29$i$i>>2] = $or28$i$i;
         $add$ptr30$i$i = (($add$ptr17$i$i) + ($add26$i$i)|0);
         HEAP32[$add$ptr30$i$i>>2] = $add26$i$i;
         break;
        }
        $head32$i$i = ((($add$ptr16$i$i)) + 4|0);
        $144 = HEAP32[$head32$i$i>>2]|0;
        $and33$i$i = $144 & 3;
        $cmp34$i$i = ($and33$i$i|0)==(1);
        if ($cmp34$i$i) {
         $and37$i$i = $144 & -8;
         $shr$i34$i = $144 >>> 3;
         $cmp38$i$i = ($144>>>0)<(256);
         L314: do {
          if ($cmp38$i$i) {
           $fd$i$i = ((($add$ptr16$i$i)) + 8|0);
           $145 = HEAP32[$fd$i$i>>2]|0;
           $bk$i35$i = ((($add$ptr16$i$i)) + 12|0);
           $146 = HEAP32[$bk$i35$i>>2]|0;
           $shl$i36$i = $shr$i34$i << 1;
           $arrayidx$i37$i = (3768 + ($shl$i36$i<<2)|0);
           $cmp41$i$i = ($145|0)==($arrayidx$i37$i|0);
           do {
            if (!($cmp41$i$i)) {
             $cmp42$i$i = ($145>>>0)<($147>>>0);
             if ($cmp42$i$i) {
              _abort();
              // unreachable;
             }
             $bk43$i$i = ((($145)) + 12|0);
             $148 = HEAP32[$bk43$i$i>>2]|0;
             $cmp44$i$i = ($148|0)==($add$ptr16$i$i|0);
             if ($cmp44$i$i) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $cmp46$i38$i = ($146|0)==($145|0);
           if ($cmp46$i38$i) {
            $shl48$i$i = 1 << $shr$i34$i;
            $neg$i$i = $shl48$i$i ^ -1;
            $149 = HEAP32[932]|0;
            $and49$i$i = $149 & $neg$i$i;
            HEAP32[932] = $and49$i$i;
            break;
           }
           $cmp54$i$i = ($146|0)==($arrayidx$i37$i|0);
           do {
            if ($cmp54$i$i) {
             $$pre5$i$i = ((($146)) + 8|0);
             $fd68$pre$phi$i$iZ2D = $$pre5$i$i;
            } else {
             $cmp57$i$i = ($146>>>0)<($147>>>0);
             if ($cmp57$i$i) {
              _abort();
              // unreachable;
             }
             $fd59$i$i = ((($146)) + 8|0);
             $150 = HEAP32[$fd59$i$i>>2]|0;
             $cmp60$i$i = ($150|0)==($add$ptr16$i$i|0);
             if ($cmp60$i$i) {
              $fd68$pre$phi$i$iZ2D = $fd59$i$i;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $bk67$i$i = ((($145)) + 12|0);
           HEAP32[$bk67$i$i>>2] = $146;
           HEAP32[$fd68$pre$phi$i$iZ2D>>2] = $145;
          } else {
           $parent$i40$i = ((($add$ptr16$i$i)) + 24|0);
           $151 = HEAP32[$parent$i40$i>>2]|0;
           $bk74$i$i = ((($add$ptr16$i$i)) + 12|0);
           $152 = HEAP32[$bk74$i$i>>2]|0;
           $cmp75$i$i = ($152|0)==($add$ptr16$i$i|0);
           do {
            if ($cmp75$i$i) {
             $child$i$i = ((($add$ptr16$i$i)) + 16|0);
             $arrayidx96$i$i = ((($child$i$i)) + 4|0);
             $156 = HEAP32[$arrayidx96$i$i>>2]|0;
             $cmp97$i$i = ($156|0)==(0|0);
             if ($cmp97$i$i) {
              $157 = HEAP32[$child$i$i>>2]|0;
              $cmp100$i$i = ($157|0)==(0|0);
              if ($cmp100$i$i) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i = $157;$RP$1$i$i = $child$i$i;
              }
             } else {
              $R$1$i$i = $156;$RP$1$i$i = $arrayidx96$i$i;
             }
             while(1) {
              $arrayidx103$i$i = ((($R$1$i$i)) + 20|0);
              $158 = HEAP32[$arrayidx103$i$i>>2]|0;
              $cmp104$i$i = ($158|0)==(0|0);
              if (!($cmp104$i$i)) {
               $R$1$i$i = $158;$RP$1$i$i = $arrayidx103$i$i;
               continue;
              }
              $arrayidx107$i$i = ((($R$1$i$i)) + 16|0);
              $159 = HEAP32[$arrayidx107$i$i>>2]|0;
              $cmp108$i$i = ($159|0)==(0|0);
              if ($cmp108$i$i) {
               break;
              } else {
               $R$1$i$i = $159;$RP$1$i$i = $arrayidx107$i$i;
              }
             }
             $cmp112$i$i = ($RP$1$i$i>>>0)<($147>>>0);
             if ($cmp112$i$i) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$RP$1$i$i>>2] = 0;
              $R$3$i$i = $R$1$i$i;
              break;
             }
            } else {
             $fd78$i$i = ((($add$ptr16$i$i)) + 8|0);
             $153 = HEAP32[$fd78$i$i>>2]|0;
             $cmp81$i$i = ($153>>>0)<($147>>>0);
             if ($cmp81$i$i) {
              _abort();
              // unreachable;
             }
             $bk82$i$i = ((($153)) + 12|0);
             $154 = HEAP32[$bk82$i$i>>2]|0;
             $cmp83$i$i = ($154|0)==($add$ptr16$i$i|0);
             if (!($cmp83$i$i)) {
              _abort();
              // unreachable;
             }
             $fd85$i$i = ((($152)) + 8|0);
             $155 = HEAP32[$fd85$i$i>>2]|0;
             $cmp86$i$i = ($155|0)==($add$ptr16$i$i|0);
             if ($cmp86$i$i) {
              HEAP32[$bk82$i$i>>2] = $152;
              HEAP32[$fd85$i$i>>2] = $153;
              $R$3$i$i = $152;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $cmp120$i42$i = ($151|0)==(0|0);
           if ($cmp120$i42$i) {
            break;
           }
           $index$i43$i = ((($add$ptr16$i$i)) + 28|0);
           $160 = HEAP32[$index$i43$i>>2]|0;
           $arrayidx123$i$i = (4032 + ($160<<2)|0);
           $161 = HEAP32[$arrayidx123$i$i>>2]|0;
           $cmp124$i$i = ($add$ptr16$i$i|0)==($161|0);
           do {
            if ($cmp124$i$i) {
             HEAP32[$arrayidx123$i$i>>2] = $R$3$i$i;
             $cond2$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond2$i$i)) {
              break;
             }
             $shl131$i$i = 1 << $160;
             $neg132$i$i = $shl131$i$i ^ -1;
             $162 = HEAP32[(3732)>>2]|0;
             $and133$i$i = $162 & $neg132$i$i;
             HEAP32[(3732)>>2] = $and133$i$i;
             break L314;
            } else {
             $163 = HEAP32[(3744)>>2]|0;
             $cmp137$i$i = ($151>>>0)<($163>>>0);
             if ($cmp137$i$i) {
              _abort();
              // unreachable;
             } else {
              $arrayidx143$i$i = ((($151)) + 16|0);
              $164 = HEAP32[$arrayidx143$i$i>>2]|0;
              $not$cmp144$i$i = ($164|0)!=($add$ptr16$i$i|0);
              $$sink$i$i = $not$cmp144$i$i&1;
              $arrayidx151$i$i = (((($151)) + 16|0) + ($$sink$i$i<<2)|0);
              HEAP32[$arrayidx151$i$i>>2] = $R$3$i$i;
              $cmp156$i$i = ($R$3$i$i|0)==(0|0);
              if ($cmp156$i$i) {
               break L314;
              } else {
               break;
              }
             }
            }
           } while(0);
           $165 = HEAP32[(3744)>>2]|0;
           $cmp160$i$i = ($R$3$i$i>>>0)<($165>>>0);
           if ($cmp160$i$i) {
            _abort();
            // unreachable;
           }
           $parent165$i$i = ((($R$3$i$i)) + 24|0);
           HEAP32[$parent165$i$i>>2] = $151;
           $child166$i$i = ((($add$ptr16$i$i)) + 16|0);
           $166 = HEAP32[$child166$i$i>>2]|0;
           $cmp168$i$i = ($166|0)==(0|0);
           do {
            if (!($cmp168$i$i)) {
             $cmp172$i$i = ($166>>>0)<($165>>>0);
             if ($cmp172$i$i) {
              _abort();
              // unreachable;
             } else {
              $arrayidx178$i$i = ((($R$3$i$i)) + 16|0);
              HEAP32[$arrayidx178$i$i>>2] = $166;
              $parent179$i$i = ((($166)) + 24|0);
              HEAP32[$parent179$i$i>>2] = $R$3$i$i;
              break;
             }
            }
           } while(0);
           $arrayidx184$i$i = ((($child166$i$i)) + 4|0);
           $167 = HEAP32[$arrayidx184$i$i>>2]|0;
           $cmp185$i$i = ($167|0)==(0|0);
           if ($cmp185$i$i) {
            break;
           }
           $168 = HEAP32[(3744)>>2]|0;
           $cmp189$i$i = ($167>>>0)<($168>>>0);
           if ($cmp189$i$i) {
            _abort();
            // unreachable;
           } else {
            $arrayidx195$i$i = ((($R$3$i$i)) + 20|0);
            HEAP32[$arrayidx195$i$i>>2] = $167;
            $parent196$i$i = ((($167)) + 24|0);
            HEAP32[$parent196$i$i>>2] = $R$3$i$i;
            break;
           }
          }
         } while(0);
         $add$ptr205$i$i = (($add$ptr16$i$i) + ($and37$i$i)|0);
         $add206$i$i = (($and37$i$i) + ($sub18$i$i))|0;
         $oldfirst$0$i$i = $add$ptr205$i$i;$qsize$0$i$i = $add206$i$i;
        } else {
         $oldfirst$0$i$i = $add$ptr16$i$i;$qsize$0$i$i = $sub18$i$i;
        }
        $head208$i$i = ((($oldfirst$0$i$i)) + 4|0);
        $169 = HEAP32[$head208$i$i>>2]|0;
        $and209$i$i = $169 & -2;
        HEAP32[$head208$i$i>>2] = $and209$i$i;
        $or210$i$i = $qsize$0$i$i | 1;
        $head211$i$i = ((($add$ptr17$i$i)) + 4|0);
        HEAP32[$head211$i$i>>2] = $or210$i$i;
        $add$ptr212$i$i = (($add$ptr17$i$i) + ($qsize$0$i$i)|0);
        HEAP32[$add$ptr212$i$i>>2] = $qsize$0$i$i;
        $shr214$i$i = $qsize$0$i$i >>> 3;
        $cmp215$i$i = ($qsize$0$i$i>>>0)<(256);
        if ($cmp215$i$i) {
         $shl222$i$i = $shr214$i$i << 1;
         $arrayidx223$i$i = (3768 + ($shl222$i$i<<2)|0);
         $170 = HEAP32[932]|0;
         $shl226$i$i = 1 << $shr214$i$i;
         $and227$i$i = $170 & $shl226$i$i;
         $tobool228$i$i = ($and227$i$i|0)==(0);
         do {
          if ($tobool228$i$i) {
           $or232$i$i = $170 | $shl226$i$i;
           HEAP32[932] = $or232$i$i;
           $$pre$i45$i = ((($arrayidx223$i$i)) + 8|0);
           $$pre$phi$i46$iZ2D = $$pre$i45$i;$F224$0$i$i = $arrayidx223$i$i;
          } else {
           $171 = ((($arrayidx223$i$i)) + 8|0);
           $172 = HEAP32[$171>>2]|0;
           $173 = HEAP32[(3744)>>2]|0;
           $cmp236$i$i = ($172>>>0)<($173>>>0);
           if (!($cmp236$i$i)) {
            $$pre$phi$i46$iZ2D = $171;$F224$0$i$i = $172;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i46$iZ2D>>2] = $add$ptr17$i$i;
         $bk246$i$i = ((($F224$0$i$i)) + 12|0);
         HEAP32[$bk246$i$i>>2] = $add$ptr17$i$i;
         $fd247$i$i = ((($add$ptr17$i$i)) + 8|0);
         HEAP32[$fd247$i$i>>2] = $F224$0$i$i;
         $bk248$i$i = ((($add$ptr17$i$i)) + 12|0);
         HEAP32[$bk248$i$i>>2] = $arrayidx223$i$i;
         break;
        }
        $shr253$i$i = $qsize$0$i$i >>> 8;
        $cmp254$i$i = ($shr253$i$i|0)==(0);
        do {
         if ($cmp254$i$i) {
          $I252$0$i$i = 0;
         } else {
          $cmp258$i$i = ($qsize$0$i$i>>>0)>(16777215);
          if ($cmp258$i$i) {
           $I252$0$i$i = 31;
           break;
          }
          $sub262$i$i = (($shr253$i$i) + 1048320)|0;
          $shr263$i$i = $sub262$i$i >>> 16;
          $and264$i$i = $shr263$i$i & 8;
          $shl265$i$i = $shr253$i$i << $and264$i$i;
          $sub266$i$i = (($shl265$i$i) + 520192)|0;
          $shr267$i$i = $sub266$i$i >>> 16;
          $and268$i$i = $shr267$i$i & 4;
          $add269$i$i = $and268$i$i | $and264$i$i;
          $shl270$i$i = $shl265$i$i << $and268$i$i;
          $sub271$i$i = (($shl270$i$i) + 245760)|0;
          $shr272$i$i = $sub271$i$i >>> 16;
          $and273$i$i = $shr272$i$i & 2;
          $add274$i$i = $add269$i$i | $and273$i$i;
          $sub275$i$i = (14 - ($add274$i$i))|0;
          $shl276$i$i = $shl270$i$i << $and273$i$i;
          $shr277$i$i = $shl276$i$i >>> 15;
          $add278$i$i = (($sub275$i$i) + ($shr277$i$i))|0;
          $shl279$i$i = $add278$i$i << 1;
          $add280$i$i = (($add278$i$i) + 7)|0;
          $shr281$i$i = $qsize$0$i$i >>> $add280$i$i;
          $and282$i$i = $shr281$i$i & 1;
          $add283$i$i = $and282$i$i | $shl279$i$i;
          $I252$0$i$i = $add283$i$i;
         }
        } while(0);
        $arrayidx287$i$i = (4032 + ($I252$0$i$i<<2)|0);
        $index288$i$i = ((($add$ptr17$i$i)) + 28|0);
        HEAP32[$index288$i$i>>2] = $I252$0$i$i;
        $child289$i$i = ((($add$ptr17$i$i)) + 16|0);
        $arrayidx290$i$i = ((($child289$i$i)) + 4|0);
        HEAP32[$arrayidx290$i$i>>2] = 0;
        HEAP32[$child289$i$i>>2] = 0;
        $174 = HEAP32[(3732)>>2]|0;
        $shl294$i$i = 1 << $I252$0$i$i;
        $and295$i$i = $174 & $shl294$i$i;
        $tobool296$i$i = ($and295$i$i|0)==(0);
        if ($tobool296$i$i) {
         $or300$i$i = $174 | $shl294$i$i;
         HEAP32[(3732)>>2] = $or300$i$i;
         HEAP32[$arrayidx287$i$i>>2] = $add$ptr17$i$i;
         $parent301$i$i = ((($add$ptr17$i$i)) + 24|0);
         HEAP32[$parent301$i$i>>2] = $arrayidx287$i$i;
         $bk302$i$i = ((($add$ptr17$i$i)) + 12|0);
         HEAP32[$bk302$i$i>>2] = $add$ptr17$i$i;
         $fd303$i$i = ((($add$ptr17$i$i)) + 8|0);
         HEAP32[$fd303$i$i>>2] = $add$ptr17$i$i;
         break;
        }
        $175 = HEAP32[$arrayidx287$i$i>>2]|0;
        $cmp306$i$i = ($I252$0$i$i|0)==(31);
        $shr310$i$i = $I252$0$i$i >>> 1;
        $sub313$i$i = (25 - ($shr310$i$i))|0;
        $cond315$i$i = $cmp306$i$i ? 0 : $sub313$i$i;
        $shl316$i$i = $qsize$0$i$i << $cond315$i$i;
        $K305$0$i$i = $shl316$i$i;$T$0$i47$i = $175;
        while(1) {
         $head317$i$i = ((($T$0$i47$i)) + 4|0);
         $176 = HEAP32[$head317$i$i>>2]|0;
         $and318$i$i = $176 & -8;
         $cmp319$i$i = ($and318$i$i|0)==($qsize$0$i$i|0);
         if ($cmp319$i$i) {
          label = 265;
          break;
         }
         $shr323$i$i = $K305$0$i$i >>> 31;
         $arrayidx325$i$i = (((($T$0$i47$i)) + 16|0) + ($shr323$i$i<<2)|0);
         $shl326$i$i = $K305$0$i$i << 1;
         $177 = HEAP32[$arrayidx325$i$i>>2]|0;
         $cmp327$i$i = ($177|0)==(0|0);
         if ($cmp327$i$i) {
          label = 262;
          break;
         } else {
          $K305$0$i$i = $shl326$i$i;$T$0$i47$i = $177;
         }
        }
        if ((label|0) == 262) {
         $178 = HEAP32[(3744)>>2]|0;
         $cmp332$i$i = ($arrayidx325$i$i>>>0)<($178>>>0);
         if ($cmp332$i$i) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$arrayidx325$i$i>>2] = $add$ptr17$i$i;
          $parent337$i$i = ((($add$ptr17$i$i)) + 24|0);
          HEAP32[$parent337$i$i>>2] = $T$0$i47$i;
          $bk338$i$i = ((($add$ptr17$i$i)) + 12|0);
          HEAP32[$bk338$i$i>>2] = $add$ptr17$i$i;
          $fd339$i$i = ((($add$ptr17$i$i)) + 8|0);
          HEAP32[$fd339$i$i>>2] = $add$ptr17$i$i;
          break;
         }
        }
        else if ((label|0) == 265) {
         $fd344$i$i = ((($T$0$i47$i)) + 8|0);
         $179 = HEAP32[$fd344$i$i>>2]|0;
         $180 = HEAP32[(3744)>>2]|0;
         $cmp350$i$i = ($179>>>0)>=($180>>>0);
         $not$cmp346$i$i = ($T$0$i47$i>>>0)>=($180>>>0);
         $181 = $cmp350$i$i & $not$cmp346$i$i;
         if ($181) {
          $bk357$i$i = ((($179)) + 12|0);
          HEAP32[$bk357$i$i>>2] = $add$ptr17$i$i;
          HEAP32[$fd344$i$i>>2] = $add$ptr17$i$i;
          $fd359$i$i = ((($add$ptr17$i$i)) + 8|0);
          HEAP32[$fd359$i$i>>2] = $179;
          $bk360$i$i = ((($add$ptr17$i$i)) + 12|0);
          HEAP32[$bk360$i$i>>2] = $T$0$i47$i;
          $parent361$i$i = ((($add$ptr17$i$i)) + 24|0);
          HEAP32[$parent361$i$i>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $add$ptr369$i$i = ((($add$ptr4$i26$i)) + 8|0);
      $retval$0 = $add$ptr369$i$i;
      STACKTOP = sp;return ($retval$0|0);
     }
    }
    $sp$0$i$i$i = (4176);
    while(1) {
     $182 = HEAP32[$sp$0$i$i$i>>2]|0;
     $cmp$i$i$i = ($182>>>0)>($116>>>0);
     if (!($cmp$i$i$i)) {
      $size$i$i$i = ((($sp$0$i$i$i)) + 4|0);
      $183 = HEAP32[$size$i$i$i>>2]|0;
      $add$ptr$i$i$i = (($182) + ($183)|0);
      $cmp2$i$i$i = ($add$ptr$i$i$i>>>0)>($116>>>0);
      if ($cmp2$i$i$i) {
       break;
      }
     }
     $next$i$i$i = ((($sp$0$i$i$i)) + 8|0);
     $184 = HEAP32[$next$i$i$i>>2]|0;
     $sp$0$i$i$i = $184;
    }
    $add$ptr2$i$i = ((($add$ptr$i$i$i)) + -47|0);
    $add$ptr3$i$i = ((($add$ptr2$i$i)) + 8|0);
    $185 = $add$ptr3$i$i;
    $and$i$i = $185 & 7;
    $cmp$i9$i = ($and$i$i|0)==(0);
    $186 = (0 - ($185))|0;
    $and6$i10$i = $186 & 7;
    $cond$i$i = $cmp$i9$i ? 0 : $and6$i10$i;
    $add$ptr7$i$i = (($add$ptr2$i$i) + ($cond$i$i)|0);
    $add$ptr81$i$i = ((($116)) + 16|0);
    $cmp9$i$i = ($add$ptr7$i$i>>>0)<($add$ptr81$i$i>>>0);
    $cond13$i$i = $cmp9$i$i ? $116 : $add$ptr7$i$i;
    $add$ptr14$i$i = ((($cond13$i$i)) + 8|0);
    $add$ptr15$i$i = ((($cond13$i$i)) + 24|0);
    $sub16$i$i = (($tsize$795$i) + -40)|0;
    $add$ptr$i2$i$i = ((($tbase$796$i)) + 8|0);
    $187 = $add$ptr$i2$i$i;
    $and$i$i$i = $187 & 7;
    $cmp$i3$i$i = ($and$i$i$i|0)==(0);
    $188 = (0 - ($187))|0;
    $and3$i$i$i = $188 & 7;
    $cond$i$i$i = $cmp$i3$i$i ? 0 : $and3$i$i$i;
    $add$ptr4$i$i$i = (($tbase$796$i) + ($cond$i$i$i)|0);
    $sub5$i$i$i = (($sub16$i$i) - ($cond$i$i$i))|0;
    HEAP32[(3752)>>2] = $add$ptr4$i$i$i;
    HEAP32[(3740)>>2] = $sub5$i$i$i;
    $or$i$i$i = $sub5$i$i$i | 1;
    $head$i$i$i = ((($add$ptr4$i$i$i)) + 4|0);
    HEAP32[$head$i$i$i>>2] = $or$i$i$i;
    $add$ptr6$i$i$i = (($add$ptr4$i$i$i) + ($sub5$i$i$i)|0);
    $head7$i$i$i = ((($add$ptr6$i$i$i)) + 4|0);
    HEAP32[$head7$i$i$i>>2] = 40;
    $189 = HEAP32[(4216)>>2]|0;
    HEAP32[(3756)>>2] = $189;
    $head$i$i = ((($cond13$i$i)) + 4|0);
    HEAP32[$head$i$i>>2] = 27;
    ;HEAP32[$add$ptr14$i$i>>2]=HEAP32[(4176)>>2]|0;HEAP32[$add$ptr14$i$i+4>>2]=HEAP32[(4176)+4>>2]|0;HEAP32[$add$ptr14$i$i+8>>2]=HEAP32[(4176)+8>>2]|0;HEAP32[$add$ptr14$i$i+12>>2]=HEAP32[(4176)+12>>2]|0;
    HEAP32[(4176)>>2] = $tbase$796$i;
    HEAP32[(4180)>>2] = $tsize$795$i;
    HEAP32[(4188)>>2] = 0;
    HEAP32[(4184)>>2] = $add$ptr14$i$i;
    $190 = $add$ptr15$i$i;
    while(1) {
     $add$ptr24$i$i = ((($190)) + 4|0);
     HEAP32[$add$ptr24$i$i>>2] = 7;
     $head26$i$i = ((($190)) + 8|0);
     $cmp27$i$i = ($head26$i$i>>>0)<($add$ptr$i$i$i>>>0);
     if ($cmp27$i$i) {
      $190 = $add$ptr24$i$i;
     } else {
      break;
     }
    }
    $cmp28$i$i = ($cond13$i$i|0)==($116|0);
    if (!($cmp28$i$i)) {
     $sub$ptr$lhs$cast$i$i = $cond13$i$i;
     $sub$ptr$rhs$cast$i$i = $116;
     $sub$ptr$sub$i$i = (($sub$ptr$lhs$cast$i$i) - ($sub$ptr$rhs$cast$i$i))|0;
     $191 = HEAP32[$head$i$i>>2]|0;
     $and32$i$i = $191 & -2;
     HEAP32[$head$i$i>>2] = $and32$i$i;
     $or33$i$i = $sub$ptr$sub$i$i | 1;
     $head34$i$i = ((($116)) + 4|0);
     HEAP32[$head34$i$i>>2] = $or33$i$i;
     HEAP32[$cond13$i$i>>2] = $sub$ptr$sub$i$i;
     $shr$i$i = $sub$ptr$sub$i$i >>> 3;
     $cmp36$i$i = ($sub$ptr$sub$i$i>>>0)<(256);
     if ($cmp36$i$i) {
      $shl$i$i = $shr$i$i << 1;
      $arrayidx$i$i = (3768 + ($shl$i$i<<2)|0);
      $192 = HEAP32[932]|0;
      $shl39$i$i = 1 << $shr$i$i;
      $and40$i$i = $192 & $shl39$i$i;
      $tobool$i$i = ($and40$i$i|0)==(0);
      if ($tobool$i$i) {
       $or44$i$i = $192 | $shl39$i$i;
       HEAP32[932] = $or44$i$i;
       $$pre$i$i = ((($arrayidx$i$i)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $arrayidx$i$i;
      } else {
       $193 = ((($arrayidx$i$i)) + 8|0);
       $194 = HEAP32[$193>>2]|0;
       $195 = HEAP32[(3744)>>2]|0;
       $cmp46$i$i = ($194>>>0)<($195>>>0);
       if ($cmp46$i$i) {
        _abort();
        // unreachable;
       } else {
        $$pre$phi$i$iZ2D = $193;$F$0$i$i = $194;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $116;
      $bk$i$i = ((($F$0$i$i)) + 12|0);
      HEAP32[$bk$i$i>>2] = $116;
      $fd54$i$i = ((($116)) + 8|0);
      HEAP32[$fd54$i$i>>2] = $F$0$i$i;
      $bk55$i$i = ((($116)) + 12|0);
      HEAP32[$bk55$i$i>>2] = $arrayidx$i$i;
      break;
     }
     $shr58$i$i = $sub$ptr$sub$i$i >>> 8;
     $cmp59$i$i = ($shr58$i$i|0)==(0);
     if ($cmp59$i$i) {
      $I57$0$i$i = 0;
     } else {
      $cmp63$i$i = ($sub$ptr$sub$i$i>>>0)>(16777215);
      if ($cmp63$i$i) {
       $I57$0$i$i = 31;
      } else {
       $sub67$i$i = (($shr58$i$i) + 1048320)|0;
       $shr68$i$i = $sub67$i$i >>> 16;
       $and69$i$i = $shr68$i$i & 8;
       $shl70$i$i = $shr58$i$i << $and69$i$i;
       $sub71$i$i = (($shl70$i$i) + 520192)|0;
       $shr72$i$i = $sub71$i$i >>> 16;
       $and73$i$i = $shr72$i$i & 4;
       $add74$i$i = $and73$i$i | $and69$i$i;
       $shl75$i$i = $shl70$i$i << $and73$i$i;
       $sub76$i$i = (($shl75$i$i) + 245760)|0;
       $shr77$i$i = $sub76$i$i >>> 16;
       $and78$i$i = $shr77$i$i & 2;
       $add79$i$i = $add74$i$i | $and78$i$i;
       $sub80$i$i = (14 - ($add79$i$i))|0;
       $shl81$i$i = $shl75$i$i << $and78$i$i;
       $shr82$i$i = $shl81$i$i >>> 15;
       $add83$i$i = (($sub80$i$i) + ($shr82$i$i))|0;
       $shl84$i$i = $add83$i$i << 1;
       $add85$i$i = (($add83$i$i) + 7)|0;
       $shr86$i$i = $sub$ptr$sub$i$i >>> $add85$i$i;
       $and87$i$i = $shr86$i$i & 1;
       $add88$i$i = $and87$i$i | $shl84$i$i;
       $I57$0$i$i = $add88$i$i;
      }
     }
     $arrayidx91$i$i = (4032 + ($I57$0$i$i<<2)|0);
     $index$i$i = ((($116)) + 28|0);
     HEAP32[$index$i$i>>2] = $I57$0$i$i;
     $arrayidx92$i$i = ((($116)) + 20|0);
     HEAP32[$arrayidx92$i$i>>2] = 0;
     HEAP32[$add$ptr81$i$i>>2] = 0;
     $196 = HEAP32[(3732)>>2]|0;
     $shl95$i$i = 1 << $I57$0$i$i;
     $and96$i$i = $196 & $shl95$i$i;
     $tobool97$i$i = ($and96$i$i|0)==(0);
     if ($tobool97$i$i) {
      $or101$i$i = $196 | $shl95$i$i;
      HEAP32[(3732)>>2] = $or101$i$i;
      HEAP32[$arrayidx91$i$i>>2] = $116;
      $parent$i$i = ((($116)) + 24|0);
      HEAP32[$parent$i$i>>2] = $arrayidx91$i$i;
      $bk102$i$i = ((($116)) + 12|0);
      HEAP32[$bk102$i$i>>2] = $116;
      $fd103$i$i = ((($116)) + 8|0);
      HEAP32[$fd103$i$i>>2] = $116;
      break;
     }
     $197 = HEAP32[$arrayidx91$i$i>>2]|0;
     $cmp106$i$i = ($I57$0$i$i|0)==(31);
     $shr110$i$i = $I57$0$i$i >>> 1;
     $sub113$i$i = (25 - ($shr110$i$i))|0;
     $cond115$i$i = $cmp106$i$i ? 0 : $sub113$i$i;
     $shl116$i$i = $sub$ptr$sub$i$i << $cond115$i$i;
     $K105$0$i$i = $shl116$i$i;$T$0$i$i = $197;
     while(1) {
      $head118$i$i = ((($T$0$i$i)) + 4|0);
      $198 = HEAP32[$head118$i$i>>2]|0;
      $and119$i$i = $198 & -8;
      $cmp120$i$i = ($and119$i$i|0)==($sub$ptr$sub$i$i|0);
      if ($cmp120$i$i) {
       label = 292;
       break;
      }
      $shr124$i$i = $K105$0$i$i >>> 31;
      $arrayidx126$i$i = (((($T$0$i$i)) + 16|0) + ($shr124$i$i<<2)|0);
      $shl127$i$i = $K105$0$i$i << 1;
      $199 = HEAP32[$arrayidx126$i$i>>2]|0;
      $cmp128$i$i = ($199|0)==(0|0);
      if ($cmp128$i$i) {
       label = 289;
       break;
      } else {
       $K105$0$i$i = $shl127$i$i;$T$0$i$i = $199;
      }
     }
     if ((label|0) == 289) {
      $200 = HEAP32[(3744)>>2]|0;
      $cmp133$i$i = ($arrayidx126$i$i>>>0)<($200>>>0);
      if ($cmp133$i$i) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$arrayidx126$i$i>>2] = $116;
       $parent138$i$i = ((($116)) + 24|0);
       HEAP32[$parent138$i$i>>2] = $T$0$i$i;
       $bk139$i$i = ((($116)) + 12|0);
       HEAP32[$bk139$i$i>>2] = $116;
       $fd140$i$i = ((($116)) + 8|0);
       HEAP32[$fd140$i$i>>2] = $116;
       break;
      }
     }
     else if ((label|0) == 292) {
      $fd148$i$i = ((($T$0$i$i)) + 8|0);
      $201 = HEAP32[$fd148$i$i>>2]|0;
      $202 = HEAP32[(3744)>>2]|0;
      $cmp153$i$i = ($201>>>0)>=($202>>>0);
      $not$cmp150$i$i = ($T$0$i$i>>>0)>=($202>>>0);
      $203 = $cmp153$i$i & $not$cmp150$i$i;
      if ($203) {
       $bk158$i$i = ((($201)) + 12|0);
       HEAP32[$bk158$i$i>>2] = $116;
       HEAP32[$fd148$i$i>>2] = $116;
       $fd160$i$i = ((($116)) + 8|0);
       HEAP32[$fd160$i$i>>2] = $201;
       $bk161$i$i = ((($116)) + 12|0);
       HEAP32[$bk161$i$i>>2] = $T$0$i$i;
       $parent162$i$i = ((($116)) + 24|0);
       HEAP32[$parent162$i$i>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $204 = HEAP32[(3740)>>2]|0;
  $cmp257$i = ($204>>>0)>($nb$0>>>0);
  if ($cmp257$i) {
   $sub260$i = (($204) - ($nb$0))|0;
   HEAP32[(3740)>>2] = $sub260$i;
   $205 = HEAP32[(3752)>>2]|0;
   $add$ptr262$i = (($205) + ($nb$0)|0);
   HEAP32[(3752)>>2] = $add$ptr262$i;
   $or264$i = $sub260$i | 1;
   $head265$i = ((($add$ptr262$i)) + 4|0);
   HEAP32[$head265$i>>2] = $or264$i;
   $or267$i = $nb$0 | 3;
   $head268$i = ((($205)) + 4|0);
   HEAP32[$head268$i>>2] = $or267$i;
   $add$ptr269$i = ((($205)) + 8|0);
   $retval$0 = $add$ptr269$i;
   STACKTOP = sp;return ($retval$0|0);
  }
 }
 $call275$i = (___errno_location()|0);
 HEAP32[$call275$i>>2] = 12;
 $retval$0 = 0;
 STACKTOP = sp;return ($retval$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$pre = 0, $$pre$phiZ2D = 0, $$pre308 = 0, $$pre309 = 0, $$sink = 0, $$sink4 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0;
 var $9 = 0, $F510$0 = 0, $I534$0 = 0, $K583$0 = 0, $R$1 = 0, $R$3 = 0, $R332$1 = 0, $R332$3 = 0, $RP$1 = 0, $RP360$1 = 0, $T$0 = 0, $add$ptr = 0, $add$ptr16 = 0, $add$ptr217 = 0, $add$ptr261 = 0, $add$ptr482 = 0, $add$ptr498 = 0, $add$ptr6 = 0, $add17 = 0, $add246 = 0;
 var $add258 = 0, $add267 = 0, $add550 = 0, $add555 = 0, $add559 = 0, $add561 = 0, $add564 = 0, $and = 0, $and140 = 0, $and210 = 0, $and215 = 0, $and232 = 0, $and240 = 0, $and266 = 0, $and301 = 0, $and410 = 0, $and46 = 0, $and495 = 0, $and5 = 0, $and512 = 0;
 var $and545 = 0, $and549 = 0, $and554 = 0, $and563 = 0, $and574 = 0, $and592 = 0, $and8 = 0, $arrayidx = 0, $arrayidx108 = 0, $arrayidx113 = 0, $arrayidx130 = 0, $arrayidx149 = 0, $arrayidx157 = 0, $arrayidx182 = 0, $arrayidx188 = 0, $arrayidx198 = 0, $arrayidx279 = 0, $arrayidx362 = 0, $arrayidx374 = 0, $arrayidx379 = 0;
 var $arrayidx400 = 0, $arrayidx419 = 0, $arrayidx427 = 0, $arrayidx454 = 0, $arrayidx460 = 0, $arrayidx470 = 0, $arrayidx509 = 0, $arrayidx567 = 0, $arrayidx570 = 0, $arrayidx599 = 0, $arrayidx99 = 0, $bk = 0, $bk275 = 0, $bk286 = 0, $bk321 = 0, $bk333 = 0, $bk34 = 0, $bk343 = 0, $bk529 = 0, $bk531 = 0;
 var $bk580 = 0, $bk611 = 0, $bk631 = 0, $bk634 = 0, $bk66 = 0, $bk73 = 0, $bk82 = 0, $child = 0, $child171 = 0, $child361 = 0, $child443 = 0, $child569 = 0, $cmp = 0, $cmp$i = 0, $cmp1 = 0, $cmp100 = 0, $cmp104 = 0, $cmp109 = 0, $cmp114 = 0, $cmp118 = 0;
 var $cmp127 = 0, $cmp13 = 0, $cmp131 = 0, $cmp143 = 0, $cmp162 = 0, $cmp165 = 0, $cmp173 = 0, $cmp176 = 0, $cmp18 = 0, $cmp189 = 0, $cmp192 = 0, $cmp2 = 0, $cmp211 = 0, $cmp22 = 0, $cmp228 = 0, $cmp243 = 0, $cmp249 = 0, $cmp25 = 0, $cmp255 = 0, $cmp269 = 0;
 var $cmp280 = 0, $cmp283 = 0, $cmp287 = 0, $cmp29 = 0, $cmp296 = 0, $cmp305 = 0, $cmp308 = 0, $cmp31 = 0, $cmp312 = 0, $cmp334 = 0, $cmp340 = 0, $cmp344 = 0, $cmp348 = 0, $cmp35 = 0, $cmp363 = 0, $cmp368 = 0, $cmp375 = 0, $cmp380 = 0, $cmp386 = 0, $cmp395 = 0;
 var $cmp401 = 0, $cmp413 = 0, $cmp42 = 0, $cmp432 = 0, $cmp435 = 0, $cmp445 = 0, $cmp448 = 0, $cmp461 = 0, $cmp464 = 0, $cmp484 = 0, $cmp50 = 0, $cmp502 = 0, $cmp519 = 0, $cmp53 = 0, $cmp536 = 0, $cmp540 = 0, $cmp57 = 0, $cmp584 = 0, $cmp593 = 0, $cmp601 = 0;
 var $cmp605 = 0, $cmp624 = 0, $cmp640 = 0, $cmp74 = 0, $cmp80 = 0, $cmp83 = 0, $cmp87 = 0, $cond = 0, $cond292 = 0, $cond293 = 0, $dec = 0, $fd = 0, $fd273 = 0, $fd311 = 0, $fd322$pre$phiZ2D = 0, $fd338 = 0, $fd347 = 0, $fd530 = 0, $fd56 = 0, $fd581 = 0;
 var $fd612 = 0, $fd620 = 0, $fd633 = 0, $fd67$pre$phiZ2D = 0, $fd78 = 0, $fd86 = 0, $head = 0, $head209 = 0, $head216 = 0, $head231 = 0, $head248 = 0, $head260 = 0, $head481 = 0, $head497 = 0, $head591 = 0, $idx$neg = 0, $index = 0, $index399 = 0, $index568 = 0, $neg = 0;
 var $neg139 = 0, $neg300 = 0, $neg409 = 0, $next4$i = 0, $not$cmp150 = 0, $not$cmp420 = 0, $not$cmp621 = 0, $or = 0, $or247 = 0, $or259 = 0, $or480 = 0, $or496 = 0, $or516 = 0, $or578 = 0, $p$1 = 0, $parent = 0, $parent170 = 0, $parent183 = 0, $parent199 = 0, $parent331 = 0;
 var $parent442 = 0, $parent455 = 0, $parent471 = 0, $parent579 = 0, $parent610 = 0, $parent635 = 0, $psize$1 = 0, $psize$2 = 0, $shl = 0, $shl138 = 0, $shl278 = 0, $shl299 = 0, $shl408 = 0, $shl45 = 0, $shl508 = 0, $shl511 = 0, $shl546 = 0, $shl551 = 0, $shl557 = 0, $shl560 = 0;
 var $shl573 = 0, $shl590 = 0, $shl600 = 0, $shr = 0, $shr268 = 0, $shr501 = 0, $shr535 = 0, $shr544 = 0, $shr548 = 0, $shr553 = 0, $shr558 = 0, $shr562 = 0, $shr586 = 0, $shr597 = 0, $sp$0$i = 0, $sp$0$in$i = 0, $sub = 0, $sub547 = 0, $sub552 = 0, $sub556 = 0;
 var $sub589 = 0, $tobool233 = 0, $tobool241 = 0, $tobool513 = 0, $tobool575 = 0, $tobool9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($mem|0)==(0|0);
 if ($cmp) {
  return;
 }
 $add$ptr = ((($mem)) + -8|0);
 $0 = HEAP32[(3744)>>2]|0;
 $cmp1 = ($add$ptr>>>0)<($0>>>0);
 if ($cmp1) {
  _abort();
  // unreachable;
 }
 $head = ((($mem)) + -4|0);
 $1 = HEAP32[$head>>2]|0;
 $and = $1 & 3;
 $cmp2 = ($and|0)==(1);
 if ($cmp2) {
  _abort();
  // unreachable;
 }
 $and5 = $1 & -8;
 $add$ptr6 = (($add$ptr) + ($and5)|0);
 $and8 = $1 & 1;
 $tobool9 = ($and8|0)==(0);
 L10: do {
  if ($tobool9) {
   $2 = HEAP32[$add$ptr>>2]|0;
   $cmp13 = ($and|0)==(0);
   if ($cmp13) {
    return;
   }
   $idx$neg = (0 - ($2))|0;
   $add$ptr16 = (($add$ptr) + ($idx$neg)|0);
   $add17 = (($2) + ($and5))|0;
   $cmp18 = ($add$ptr16>>>0)<($0>>>0);
   if ($cmp18) {
    _abort();
    // unreachable;
   }
   $3 = HEAP32[(3748)>>2]|0;
   $cmp22 = ($add$ptr16|0)==($3|0);
   if ($cmp22) {
    $head209 = ((($add$ptr6)) + 4|0);
    $27 = HEAP32[$head209>>2]|0;
    $and210 = $27 & 3;
    $cmp211 = ($and210|0)==(3);
    if (!($cmp211)) {
     $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
     break;
    }
    $add$ptr217 = (($add$ptr16) + ($add17)|0);
    $head216 = ((($add$ptr16)) + 4|0);
    $or = $add17 | 1;
    $and215 = $27 & -2;
    HEAP32[(3736)>>2] = $add17;
    HEAP32[$head209>>2] = $and215;
    HEAP32[$head216>>2] = $or;
    HEAP32[$add$ptr217>>2] = $add17;
    return;
   }
   $shr = $2 >>> 3;
   $cmp25 = ($2>>>0)<(256);
   if ($cmp25) {
    $fd = ((($add$ptr16)) + 8|0);
    $4 = HEAP32[$fd>>2]|0;
    $bk = ((($add$ptr16)) + 12|0);
    $5 = HEAP32[$bk>>2]|0;
    $shl = $shr << 1;
    $arrayidx = (3768 + ($shl<<2)|0);
    $cmp29 = ($4|0)==($arrayidx|0);
    if (!($cmp29)) {
     $cmp31 = ($4>>>0)<($0>>>0);
     if ($cmp31) {
      _abort();
      // unreachable;
     }
     $bk34 = ((($4)) + 12|0);
     $6 = HEAP32[$bk34>>2]|0;
     $cmp35 = ($6|0)==($add$ptr16|0);
     if (!($cmp35)) {
      _abort();
      // unreachable;
     }
    }
    $cmp42 = ($5|0)==($4|0);
    if ($cmp42) {
     $shl45 = 1 << $shr;
     $neg = $shl45 ^ -1;
     $7 = HEAP32[932]|0;
     $and46 = $7 & $neg;
     HEAP32[932] = $and46;
     $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
     break;
    }
    $cmp50 = ($5|0)==($arrayidx|0);
    if ($cmp50) {
     $$pre309 = ((($5)) + 8|0);
     $fd67$pre$phiZ2D = $$pre309;
    } else {
     $cmp53 = ($5>>>0)<($0>>>0);
     if ($cmp53) {
      _abort();
      // unreachable;
     }
     $fd56 = ((($5)) + 8|0);
     $8 = HEAP32[$fd56>>2]|0;
     $cmp57 = ($8|0)==($add$ptr16|0);
     if ($cmp57) {
      $fd67$pre$phiZ2D = $fd56;
     } else {
      _abort();
      // unreachable;
     }
    }
    $bk66 = ((($4)) + 12|0);
    HEAP32[$bk66>>2] = $5;
    HEAP32[$fd67$pre$phiZ2D>>2] = $4;
    $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
    break;
   }
   $parent = ((($add$ptr16)) + 24|0);
   $9 = HEAP32[$parent>>2]|0;
   $bk73 = ((($add$ptr16)) + 12|0);
   $10 = HEAP32[$bk73>>2]|0;
   $cmp74 = ($10|0)==($add$ptr16|0);
   do {
    if ($cmp74) {
     $child = ((($add$ptr16)) + 16|0);
     $arrayidx99 = ((($child)) + 4|0);
     $14 = HEAP32[$arrayidx99>>2]|0;
     $cmp100 = ($14|0)==(0|0);
     if ($cmp100) {
      $15 = HEAP32[$child>>2]|0;
      $cmp104 = ($15|0)==(0|0);
      if ($cmp104) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $15;$RP$1 = $child;
      }
     } else {
      $R$1 = $14;$RP$1 = $arrayidx99;
     }
     while(1) {
      $arrayidx108 = ((($R$1)) + 20|0);
      $16 = HEAP32[$arrayidx108>>2]|0;
      $cmp109 = ($16|0)==(0|0);
      if (!($cmp109)) {
       $R$1 = $16;$RP$1 = $arrayidx108;
       continue;
      }
      $arrayidx113 = ((($R$1)) + 16|0);
      $17 = HEAP32[$arrayidx113>>2]|0;
      $cmp114 = ($17|0)==(0|0);
      if ($cmp114) {
       break;
      } else {
       $R$1 = $17;$RP$1 = $arrayidx113;
      }
     }
     $cmp118 = ($RP$1>>>0)<($0>>>0);
     if ($cmp118) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1>>2] = 0;
      $R$3 = $R$1;
      break;
     }
    } else {
     $fd78 = ((($add$ptr16)) + 8|0);
     $11 = HEAP32[$fd78>>2]|0;
     $cmp80 = ($11>>>0)<($0>>>0);
     if ($cmp80) {
      _abort();
      // unreachable;
     }
     $bk82 = ((($11)) + 12|0);
     $12 = HEAP32[$bk82>>2]|0;
     $cmp83 = ($12|0)==($add$ptr16|0);
     if (!($cmp83)) {
      _abort();
      // unreachable;
     }
     $fd86 = ((($10)) + 8|0);
     $13 = HEAP32[$fd86>>2]|0;
     $cmp87 = ($13|0)==($add$ptr16|0);
     if ($cmp87) {
      HEAP32[$bk82>>2] = $10;
      HEAP32[$fd86>>2] = $11;
      $R$3 = $10;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $cmp127 = ($9|0)==(0|0);
   if ($cmp127) {
    $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
   } else {
    $index = ((($add$ptr16)) + 28|0);
    $18 = HEAP32[$index>>2]|0;
    $arrayidx130 = (4032 + ($18<<2)|0);
    $19 = HEAP32[$arrayidx130>>2]|0;
    $cmp131 = ($add$ptr16|0)==($19|0);
    do {
     if ($cmp131) {
      HEAP32[$arrayidx130>>2] = $R$3;
      $cond292 = ($R$3|0)==(0|0);
      if ($cond292) {
       $shl138 = 1 << $18;
       $neg139 = $shl138 ^ -1;
       $20 = HEAP32[(3732)>>2]|0;
       $and140 = $20 & $neg139;
       HEAP32[(3732)>>2] = $and140;
       $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
       break L10;
      }
     } else {
      $21 = HEAP32[(3744)>>2]|0;
      $cmp143 = ($9>>>0)<($21>>>0);
      if ($cmp143) {
       _abort();
       // unreachable;
      } else {
       $arrayidx149 = ((($9)) + 16|0);
       $22 = HEAP32[$arrayidx149>>2]|0;
       $not$cmp150 = ($22|0)!=($add$ptr16|0);
       $$sink = $not$cmp150&1;
       $arrayidx157 = (((($9)) + 16|0) + ($$sink<<2)|0);
       HEAP32[$arrayidx157>>2] = $R$3;
       $cmp162 = ($R$3|0)==(0|0);
       if ($cmp162) {
        $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
        break L10;
       } else {
        break;
       }
      }
     }
    } while(0);
    $23 = HEAP32[(3744)>>2]|0;
    $cmp165 = ($R$3>>>0)<($23>>>0);
    if ($cmp165) {
     _abort();
     // unreachable;
    }
    $parent170 = ((($R$3)) + 24|0);
    HEAP32[$parent170>>2] = $9;
    $child171 = ((($add$ptr16)) + 16|0);
    $24 = HEAP32[$child171>>2]|0;
    $cmp173 = ($24|0)==(0|0);
    do {
     if (!($cmp173)) {
      $cmp176 = ($24>>>0)<($23>>>0);
      if ($cmp176) {
       _abort();
       // unreachable;
      } else {
       $arrayidx182 = ((($R$3)) + 16|0);
       HEAP32[$arrayidx182>>2] = $24;
       $parent183 = ((($24)) + 24|0);
       HEAP32[$parent183>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $arrayidx188 = ((($child171)) + 4|0);
    $25 = HEAP32[$arrayidx188>>2]|0;
    $cmp189 = ($25|0)==(0|0);
    if ($cmp189) {
     $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
    } else {
     $26 = HEAP32[(3744)>>2]|0;
     $cmp192 = ($25>>>0)<($26>>>0);
     if ($cmp192) {
      _abort();
      // unreachable;
     } else {
      $arrayidx198 = ((($R$3)) + 20|0);
      HEAP32[$arrayidx198>>2] = $25;
      $parent199 = ((($25)) + 24|0);
      HEAP32[$parent199>>2] = $R$3;
      $28 = $add$ptr16;$p$1 = $add$ptr16;$psize$1 = $add17;
      break;
     }
    }
   }
  } else {
   $28 = $add$ptr;$p$1 = $add$ptr;$psize$1 = $and5;
  }
 } while(0);
 $cmp228 = ($28>>>0)<($add$ptr6>>>0);
 if (!($cmp228)) {
  _abort();
  // unreachable;
 }
 $head231 = ((($add$ptr6)) + 4|0);
 $29 = HEAP32[$head231>>2]|0;
 $and232 = $29 & 1;
 $tobool233 = ($and232|0)==(0);
 if ($tobool233) {
  _abort();
  // unreachable;
 }
 $and240 = $29 & 2;
 $tobool241 = ($and240|0)==(0);
 if ($tobool241) {
  $30 = HEAP32[(3752)>>2]|0;
  $cmp243 = ($add$ptr6|0)==($30|0);
  $31 = HEAP32[(3748)>>2]|0;
  if ($cmp243) {
   $32 = HEAP32[(3740)>>2]|0;
   $add246 = (($32) + ($psize$1))|0;
   HEAP32[(3740)>>2] = $add246;
   HEAP32[(3752)>>2] = $p$1;
   $or247 = $add246 | 1;
   $head248 = ((($p$1)) + 4|0);
   HEAP32[$head248>>2] = $or247;
   $cmp249 = ($p$1|0)==($31|0);
   if (!($cmp249)) {
    return;
   }
   HEAP32[(3748)>>2] = 0;
   HEAP32[(3736)>>2] = 0;
   return;
  }
  $cmp255 = ($add$ptr6|0)==($31|0);
  if ($cmp255) {
   $33 = HEAP32[(3736)>>2]|0;
   $add258 = (($33) + ($psize$1))|0;
   HEAP32[(3736)>>2] = $add258;
   HEAP32[(3748)>>2] = $28;
   $or259 = $add258 | 1;
   $head260 = ((($p$1)) + 4|0);
   HEAP32[$head260>>2] = $or259;
   $add$ptr261 = (($28) + ($add258)|0);
   HEAP32[$add$ptr261>>2] = $add258;
   return;
  }
  $and266 = $29 & -8;
  $add267 = (($and266) + ($psize$1))|0;
  $shr268 = $29 >>> 3;
  $cmp269 = ($29>>>0)<(256);
  L108: do {
   if ($cmp269) {
    $fd273 = ((($add$ptr6)) + 8|0);
    $34 = HEAP32[$fd273>>2]|0;
    $bk275 = ((($add$ptr6)) + 12|0);
    $35 = HEAP32[$bk275>>2]|0;
    $shl278 = $shr268 << 1;
    $arrayidx279 = (3768 + ($shl278<<2)|0);
    $cmp280 = ($34|0)==($arrayidx279|0);
    if (!($cmp280)) {
     $36 = HEAP32[(3744)>>2]|0;
     $cmp283 = ($34>>>0)<($36>>>0);
     if ($cmp283) {
      _abort();
      // unreachable;
     }
     $bk286 = ((($34)) + 12|0);
     $37 = HEAP32[$bk286>>2]|0;
     $cmp287 = ($37|0)==($add$ptr6|0);
     if (!($cmp287)) {
      _abort();
      // unreachable;
     }
    }
    $cmp296 = ($35|0)==($34|0);
    if ($cmp296) {
     $shl299 = 1 << $shr268;
     $neg300 = $shl299 ^ -1;
     $38 = HEAP32[932]|0;
     $and301 = $38 & $neg300;
     HEAP32[932] = $and301;
     break;
    }
    $cmp305 = ($35|0)==($arrayidx279|0);
    if ($cmp305) {
     $$pre308 = ((($35)) + 8|0);
     $fd322$pre$phiZ2D = $$pre308;
    } else {
     $39 = HEAP32[(3744)>>2]|0;
     $cmp308 = ($35>>>0)<($39>>>0);
     if ($cmp308) {
      _abort();
      // unreachable;
     }
     $fd311 = ((($35)) + 8|0);
     $40 = HEAP32[$fd311>>2]|0;
     $cmp312 = ($40|0)==($add$ptr6|0);
     if ($cmp312) {
      $fd322$pre$phiZ2D = $fd311;
     } else {
      _abort();
      // unreachable;
     }
    }
    $bk321 = ((($34)) + 12|0);
    HEAP32[$bk321>>2] = $35;
    HEAP32[$fd322$pre$phiZ2D>>2] = $34;
   } else {
    $parent331 = ((($add$ptr6)) + 24|0);
    $41 = HEAP32[$parent331>>2]|0;
    $bk333 = ((($add$ptr6)) + 12|0);
    $42 = HEAP32[$bk333>>2]|0;
    $cmp334 = ($42|0)==($add$ptr6|0);
    do {
     if ($cmp334) {
      $child361 = ((($add$ptr6)) + 16|0);
      $arrayidx362 = ((($child361)) + 4|0);
      $47 = HEAP32[$arrayidx362>>2]|0;
      $cmp363 = ($47|0)==(0|0);
      if ($cmp363) {
       $48 = HEAP32[$child361>>2]|0;
       $cmp368 = ($48|0)==(0|0);
       if ($cmp368) {
        $R332$3 = 0;
        break;
       } else {
        $R332$1 = $48;$RP360$1 = $child361;
       }
      } else {
       $R332$1 = $47;$RP360$1 = $arrayidx362;
      }
      while(1) {
       $arrayidx374 = ((($R332$1)) + 20|0);
       $49 = HEAP32[$arrayidx374>>2]|0;
       $cmp375 = ($49|0)==(0|0);
       if (!($cmp375)) {
        $R332$1 = $49;$RP360$1 = $arrayidx374;
        continue;
       }
       $arrayidx379 = ((($R332$1)) + 16|0);
       $50 = HEAP32[$arrayidx379>>2]|0;
       $cmp380 = ($50|0)==(0|0);
       if ($cmp380) {
        break;
       } else {
        $R332$1 = $50;$RP360$1 = $arrayidx379;
       }
      }
      $51 = HEAP32[(3744)>>2]|0;
      $cmp386 = ($RP360$1>>>0)<($51>>>0);
      if ($cmp386) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP360$1>>2] = 0;
       $R332$3 = $R332$1;
       break;
      }
     } else {
      $fd338 = ((($add$ptr6)) + 8|0);
      $43 = HEAP32[$fd338>>2]|0;
      $44 = HEAP32[(3744)>>2]|0;
      $cmp340 = ($43>>>0)<($44>>>0);
      if ($cmp340) {
       _abort();
       // unreachable;
      }
      $bk343 = ((($43)) + 12|0);
      $45 = HEAP32[$bk343>>2]|0;
      $cmp344 = ($45|0)==($add$ptr6|0);
      if (!($cmp344)) {
       _abort();
       // unreachable;
      }
      $fd347 = ((($42)) + 8|0);
      $46 = HEAP32[$fd347>>2]|0;
      $cmp348 = ($46|0)==($add$ptr6|0);
      if ($cmp348) {
       HEAP32[$bk343>>2] = $42;
       HEAP32[$fd347>>2] = $43;
       $R332$3 = $42;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $cmp395 = ($41|0)==(0|0);
    if (!($cmp395)) {
     $index399 = ((($add$ptr6)) + 28|0);
     $52 = HEAP32[$index399>>2]|0;
     $arrayidx400 = (4032 + ($52<<2)|0);
     $53 = HEAP32[$arrayidx400>>2]|0;
     $cmp401 = ($add$ptr6|0)==($53|0);
     do {
      if ($cmp401) {
       HEAP32[$arrayidx400>>2] = $R332$3;
       $cond293 = ($R332$3|0)==(0|0);
       if ($cond293) {
        $shl408 = 1 << $52;
        $neg409 = $shl408 ^ -1;
        $54 = HEAP32[(3732)>>2]|0;
        $and410 = $54 & $neg409;
        HEAP32[(3732)>>2] = $and410;
        break L108;
       }
      } else {
       $55 = HEAP32[(3744)>>2]|0;
       $cmp413 = ($41>>>0)<($55>>>0);
       if ($cmp413) {
        _abort();
        // unreachable;
       } else {
        $arrayidx419 = ((($41)) + 16|0);
        $56 = HEAP32[$arrayidx419>>2]|0;
        $not$cmp420 = ($56|0)!=($add$ptr6|0);
        $$sink4 = $not$cmp420&1;
        $arrayidx427 = (((($41)) + 16|0) + ($$sink4<<2)|0);
        HEAP32[$arrayidx427>>2] = $R332$3;
        $cmp432 = ($R332$3|0)==(0|0);
        if ($cmp432) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while(0);
     $57 = HEAP32[(3744)>>2]|0;
     $cmp435 = ($R332$3>>>0)<($57>>>0);
     if ($cmp435) {
      _abort();
      // unreachable;
     }
     $parent442 = ((($R332$3)) + 24|0);
     HEAP32[$parent442>>2] = $41;
     $child443 = ((($add$ptr6)) + 16|0);
     $58 = HEAP32[$child443>>2]|0;
     $cmp445 = ($58|0)==(0|0);
     do {
      if (!($cmp445)) {
       $cmp448 = ($58>>>0)<($57>>>0);
       if ($cmp448) {
        _abort();
        // unreachable;
       } else {
        $arrayidx454 = ((($R332$3)) + 16|0);
        HEAP32[$arrayidx454>>2] = $58;
        $parent455 = ((($58)) + 24|0);
        HEAP32[$parent455>>2] = $R332$3;
        break;
       }
      }
     } while(0);
     $arrayidx460 = ((($child443)) + 4|0);
     $59 = HEAP32[$arrayidx460>>2]|0;
     $cmp461 = ($59|0)==(0|0);
     if (!($cmp461)) {
      $60 = HEAP32[(3744)>>2]|0;
      $cmp464 = ($59>>>0)<($60>>>0);
      if ($cmp464) {
       _abort();
       // unreachable;
      } else {
       $arrayidx470 = ((($R332$3)) + 20|0);
       HEAP32[$arrayidx470>>2] = $59;
       $parent471 = ((($59)) + 24|0);
       HEAP32[$parent471>>2] = $R332$3;
       break;
      }
     }
    }
   }
  } while(0);
  $or480 = $add267 | 1;
  $head481 = ((($p$1)) + 4|0);
  HEAP32[$head481>>2] = $or480;
  $add$ptr482 = (($28) + ($add267)|0);
  HEAP32[$add$ptr482>>2] = $add267;
  $61 = HEAP32[(3748)>>2]|0;
  $cmp484 = ($p$1|0)==($61|0);
  if ($cmp484) {
   HEAP32[(3736)>>2] = $add267;
   return;
  } else {
   $psize$2 = $add267;
  }
 } else {
  $and495 = $29 & -2;
  HEAP32[$head231>>2] = $and495;
  $or496 = $psize$1 | 1;
  $head497 = ((($p$1)) + 4|0);
  HEAP32[$head497>>2] = $or496;
  $add$ptr498 = (($28) + ($psize$1)|0);
  HEAP32[$add$ptr498>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $shr501 = $psize$2 >>> 3;
 $cmp502 = ($psize$2>>>0)<(256);
 if ($cmp502) {
  $shl508 = $shr501 << 1;
  $arrayidx509 = (3768 + ($shl508<<2)|0);
  $62 = HEAP32[932]|0;
  $shl511 = 1 << $shr501;
  $and512 = $62 & $shl511;
  $tobool513 = ($and512|0)==(0);
  if ($tobool513) {
   $or516 = $62 | $shl511;
   HEAP32[932] = $or516;
   $$pre = ((($arrayidx509)) + 8|0);
   $$pre$phiZ2D = $$pre;$F510$0 = $arrayidx509;
  } else {
   $63 = ((($arrayidx509)) + 8|0);
   $64 = HEAP32[$63>>2]|0;
   $65 = HEAP32[(3744)>>2]|0;
   $cmp519 = ($64>>>0)<($65>>>0);
   if ($cmp519) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $63;$F510$0 = $64;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $bk529 = ((($F510$0)) + 12|0);
  HEAP32[$bk529>>2] = $p$1;
  $fd530 = ((($p$1)) + 8|0);
  HEAP32[$fd530>>2] = $F510$0;
  $bk531 = ((($p$1)) + 12|0);
  HEAP32[$bk531>>2] = $arrayidx509;
  return;
 }
 $shr535 = $psize$2 >>> 8;
 $cmp536 = ($shr535|0)==(0);
 if ($cmp536) {
  $I534$0 = 0;
 } else {
  $cmp540 = ($psize$2>>>0)>(16777215);
  if ($cmp540) {
   $I534$0 = 31;
  } else {
   $sub = (($shr535) + 1048320)|0;
   $shr544 = $sub >>> 16;
   $and545 = $shr544 & 8;
   $shl546 = $shr535 << $and545;
   $sub547 = (($shl546) + 520192)|0;
   $shr548 = $sub547 >>> 16;
   $and549 = $shr548 & 4;
   $add550 = $and549 | $and545;
   $shl551 = $shl546 << $and549;
   $sub552 = (($shl551) + 245760)|0;
   $shr553 = $sub552 >>> 16;
   $and554 = $shr553 & 2;
   $add555 = $add550 | $and554;
   $sub556 = (14 - ($add555))|0;
   $shl557 = $shl551 << $and554;
   $shr558 = $shl557 >>> 15;
   $add559 = (($sub556) + ($shr558))|0;
   $shl560 = $add559 << 1;
   $add561 = (($add559) + 7)|0;
   $shr562 = $psize$2 >>> $add561;
   $and563 = $shr562 & 1;
   $add564 = $and563 | $shl560;
   $I534$0 = $add564;
  }
 }
 $arrayidx567 = (4032 + ($I534$0<<2)|0);
 $index568 = ((($p$1)) + 28|0);
 HEAP32[$index568>>2] = $I534$0;
 $child569 = ((($p$1)) + 16|0);
 $arrayidx570 = ((($p$1)) + 20|0);
 HEAP32[$arrayidx570>>2] = 0;
 HEAP32[$child569>>2] = 0;
 $66 = HEAP32[(3732)>>2]|0;
 $shl573 = 1 << $I534$0;
 $and574 = $66 & $shl573;
 $tobool575 = ($and574|0)==(0);
 do {
  if ($tobool575) {
   $or578 = $66 | $shl573;
   HEAP32[(3732)>>2] = $or578;
   HEAP32[$arrayidx567>>2] = $p$1;
   $parent579 = ((($p$1)) + 24|0);
   HEAP32[$parent579>>2] = $arrayidx567;
   $bk580 = ((($p$1)) + 12|0);
   HEAP32[$bk580>>2] = $p$1;
   $fd581 = ((($p$1)) + 8|0);
   HEAP32[$fd581>>2] = $p$1;
  } else {
   $67 = HEAP32[$arrayidx567>>2]|0;
   $cmp584 = ($I534$0|0)==(31);
   $shr586 = $I534$0 >>> 1;
   $sub589 = (25 - ($shr586))|0;
   $cond = $cmp584 ? 0 : $sub589;
   $shl590 = $psize$2 << $cond;
   $K583$0 = $shl590;$T$0 = $67;
   while(1) {
    $head591 = ((($T$0)) + 4|0);
    $68 = HEAP32[$head591>>2]|0;
    $and592 = $68 & -8;
    $cmp593 = ($and592|0)==($psize$2|0);
    if ($cmp593) {
     label = 124;
     break;
    }
    $shr597 = $K583$0 >>> 31;
    $arrayidx599 = (((($T$0)) + 16|0) + ($shr597<<2)|0);
    $shl600 = $K583$0 << 1;
    $69 = HEAP32[$arrayidx599>>2]|0;
    $cmp601 = ($69|0)==(0|0);
    if ($cmp601) {
     label = 121;
     break;
    } else {
     $K583$0 = $shl600;$T$0 = $69;
    }
   }
   if ((label|0) == 121) {
    $70 = HEAP32[(3744)>>2]|0;
    $cmp605 = ($arrayidx599>>>0)<($70>>>0);
    if ($cmp605) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$arrayidx599>>2] = $p$1;
     $parent610 = ((($p$1)) + 24|0);
     HEAP32[$parent610>>2] = $T$0;
     $bk611 = ((($p$1)) + 12|0);
     HEAP32[$bk611>>2] = $p$1;
     $fd612 = ((($p$1)) + 8|0);
     HEAP32[$fd612>>2] = $p$1;
     break;
    }
   }
   else if ((label|0) == 124) {
    $fd620 = ((($T$0)) + 8|0);
    $71 = HEAP32[$fd620>>2]|0;
    $72 = HEAP32[(3744)>>2]|0;
    $cmp624 = ($71>>>0)>=($72>>>0);
    $not$cmp621 = ($T$0>>>0)>=($72>>>0);
    $73 = $cmp624 & $not$cmp621;
    if ($73) {
     $bk631 = ((($71)) + 12|0);
     HEAP32[$bk631>>2] = $p$1;
     HEAP32[$fd620>>2] = $p$1;
     $fd633 = ((($p$1)) + 8|0);
     HEAP32[$fd633>>2] = $71;
     $bk634 = ((($p$1)) + 12|0);
     HEAP32[$bk634>>2] = $T$0;
     $parent635 = ((($p$1)) + 24|0);
     HEAP32[$parent635>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $74 = HEAP32[(3760)>>2]|0;
 $dec = (($74) + -1)|0;
 HEAP32[(3760)>>2] = $dec;
 $cmp640 = ($dec|0)==(0);
 if ($cmp640) {
  $sp$0$in$i = (4184);
 } else {
  return;
 }
 while(1) {
  $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
  $cmp$i = ($sp$0$i|0)==(0|0);
  $next4$i = ((($sp$0$i)) + 8|0);
  if ($cmp$i) {
   break;
  } else {
   $sp$0$in$i = $next4$i;
  }
 }
 HEAP32[(3760)>>2] = -1;
 return;
}
function _realloc($oldmem,$bytes) {
 $oldmem = $oldmem|0;
 $bytes = $bytes|0;
 var $0 = 0, $add$ptr = 0, $add$ptr10 = 0, $add6 = 0, $and = 0, $and15 = 0, $and17 = 0, $call = 0, $call12 = 0, $call3 = 0, $call7 = 0, $cmp = 0, $cmp1 = 0, $cmp13 = 0, $cmp18 = 0, $cmp20 = 0, $cmp5 = 0, $cmp8 = 0, $cond = 0, $cond19 = 0;
 var $cond24 = 0, $head = 0, $mem$1 = 0, $sub = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($oldmem|0)==(0|0);
 if ($cmp) {
  $call = (_malloc($bytes)|0);
  $mem$1 = $call;
  return ($mem$1|0);
 }
 $cmp1 = ($bytes>>>0)>(4294967231);
 if ($cmp1) {
  $call3 = (___errno_location()|0);
  HEAP32[$call3>>2] = 12;
  $mem$1 = 0;
  return ($mem$1|0);
 }
 $cmp5 = ($bytes>>>0)<(11);
 $add6 = (($bytes) + 11)|0;
 $and = $add6 & -8;
 $cond = $cmp5 ? 16 : $and;
 $add$ptr = ((($oldmem)) + -8|0);
 $call7 = (_try_realloc_chunk($add$ptr,$cond)|0);
 $cmp8 = ($call7|0)==(0|0);
 if (!($cmp8)) {
  $add$ptr10 = ((($call7)) + 8|0);
  $mem$1 = $add$ptr10;
  return ($mem$1|0);
 }
 $call12 = (_malloc($bytes)|0);
 $cmp13 = ($call12|0)==(0|0);
 if ($cmp13) {
  $mem$1 = 0;
  return ($mem$1|0);
 }
 $head = ((($oldmem)) + -4|0);
 $0 = HEAP32[$head>>2]|0;
 $and15 = $0 & -8;
 $and17 = $0 & 3;
 $cmp18 = ($and17|0)==(0);
 $cond19 = $cmp18 ? 8 : 4;
 $sub = (($and15) - ($cond19))|0;
 $cmp20 = ($sub>>>0)<($bytes>>>0);
 $cond24 = $cmp20 ? $sub : $bytes;
 _memcpy(($call12|0),($oldmem|0),($cond24|0))|0;
 _free($oldmem);
 $mem$1 = $call12;
 return ($mem$1|0);
}
function _try_realloc_chunk($p,$nb) {
 $p = $p|0;
 $nb = $nb|0;
 var $$pre = 0, $$sink = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $R$1 = 0, $R$3 = 0;
 var $RP$1 = 0, $add = 0, $add$i = 0, $add$ptr = 0, $add$ptr17 = 0, $add$ptr298 = 0, $add$ptr30 = 0, $add$ptr303 = 0, $add$ptr317 = 0, $add$ptr41 = 0, $add$ptr66 = 0, $add$ptr67 = 0, $add$ptr91 = 0, $add105 = 0, $add58 = 0, $and = 0, $and100 = 0, $and104 = 0, $and128 = 0, $and19 = 0;
 var $and2 = 0, $and216 = 0, $and294 = 0, $and43 = 0, $and69 = 0, $and7 = 0, $and80 = 0, $arrayidx = 0, $arrayidx179 = 0, $arrayidx186 = 0, $arrayidx190 = 0, $arrayidx206 = 0, $arrayidx226 = 0, $arrayidx234 = 0, $arrayidx261 = 0, $arrayidx267 = 0, $arrayidx278 = 0, $bk = 0, $bk118 = 0, $bk147 = 0;
 var $bk155 = 0, $bk164 = 0, $child = 0, $child249 = 0, $cmp$i = 0, $cmp1$i = 0, $cmp106 = 0, $cmp11 = 0, $cmp111 = 0, $cmp114 = 0, $cmp116 = 0, $cmp119 = 0, $cmp125 = 0, $cmp13 = 0, $cmp133 = 0, $cmp136 = 0, $cmp139 = 0, $cmp15 = 0, $cmp156 = 0, $cmp162 = 0;
 var $cmp165 = 0, $cmp168 = 0, $cmp180 = 0, $cmp183 = 0, $cmp187 = 0, $cmp191 = 0, $cmp195 = 0, $cmp2$i = 0, $cmp203 = 0, $cmp207 = 0, $cmp220 = 0, $cmp239 = 0, $cmp243 = 0, $cmp251 = 0, $cmp255 = 0, $cmp268 = 0, $cmp272 = 0, $cmp288 = 0, $cmp34 = 0, $cmp36 = 0;
 var $cmp5 = 0, $cmp56 = 0, $cmp59 = 0, $cmp63 = 0, $cond = 0, $fd = 0, $fd138 = 0, $fd148$pre$phiZ2D = 0, $fd159 = 0, $fd167 = 0, $head = 0, $head23 = 0, $head299 = 0, $head31 = 0, $head310 = 0, $head318 = 0, $head48 = 0, $head6 = 0, $head74 = 0, $head79 = 0;
 var $head92 = 0, $index = 0, $neg = 0, $neg215 = 0, $newp$2 = 0, $not$cmp227 = 0, $notlhs = 0, $notrhs = 0, $or = 0, $or$cond$not = 0, $or$cond2 = 0, $or20 = 0, $or28 = 0, $or295 = 0, $or296 = 0, $or300 = 0, $or306 = 0, $or307 = 0, $or315 = 0, $or319 = 0;
 var $or32 = 0, $or44 = 0, $or45 = 0, $or50 = 0, $or70 = 0, $or71 = 0, $or76 = 0, $or88 = 0, $or89 = 0, $or93 = 0, $parent = 0, $parent248 = 0, $parent262 = 0, $parent279 = 0, $shl = 0, $shl$i = 0, $shl127 = 0, $shl214 = 0, $shr = 0, $storemerge = 0;
 var $storemerge1 = 0, $sub = 0, $sub$i = 0, $sub110 = 0, $sub40 = 0, $sub62 = 0, $tobool = 0, $tobool101 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $head = ((($p)) + 4|0);
 $0 = HEAP32[$head>>2]|0;
 $and = $0 & -8;
 $add$ptr = (($p) + ($and)|0);
 $1 = HEAP32[(3744)>>2]|0;
 $and2 = $0 & 3;
 $notlhs = ($p>>>0)>=($1>>>0);
 $notrhs = ($and2|0)!=(1);
 $or$cond$not = $notrhs & $notlhs;
 $cmp5 = ($p>>>0)<($add$ptr>>>0);
 $or$cond2 = $or$cond$not & $cmp5;
 if (!($or$cond2)) {
  _abort();
  // unreachable;
 }
 $head6 = ((($add$ptr)) + 4|0);
 $2 = HEAP32[$head6>>2]|0;
 $and7 = $2 & 1;
 $tobool = ($and7|0)==(0);
 if ($tobool) {
  _abort();
  // unreachable;
 }
 $cmp11 = ($and2|0)==(0);
 if ($cmp11) {
  $cmp$i = ($nb>>>0)<(256);
  if ($cmp$i) {
   $newp$2 = 0;
   return ($newp$2|0);
  }
  $add$i = (($nb) + 4)|0;
  $cmp1$i = ($and>>>0)<($add$i>>>0);
  if (!($cmp1$i)) {
   $sub$i = (($and) - ($nb))|0;
   $3 = HEAP32[(4208)>>2]|0;
   $shl$i = $3 << 1;
   $cmp2$i = ($sub$i>>>0)>($shl$i>>>0);
   if (!($cmp2$i)) {
    $newp$2 = $p;
    return ($newp$2|0);
   }
  }
  $newp$2 = 0;
  return ($newp$2|0);
 }
 $cmp13 = ($and>>>0)<($nb>>>0);
 if (!($cmp13)) {
  $sub = (($and) - ($nb))|0;
  $cmp15 = ($sub>>>0)>(15);
  if (!($cmp15)) {
   $newp$2 = $p;
   return ($newp$2|0);
  }
  $add$ptr17 = (($p) + ($nb)|0);
  $and19 = $0 & 1;
  $or = $and19 | $nb;
  $or20 = $or | 2;
  HEAP32[$head>>2] = $or20;
  $head23 = ((($add$ptr17)) + 4|0);
  $or28 = $sub | 3;
  HEAP32[$head23>>2] = $or28;
  $add$ptr30 = (($add$ptr17) + ($sub)|0);
  $head31 = ((($add$ptr30)) + 4|0);
  $4 = HEAP32[$head31>>2]|0;
  $or32 = $4 | 1;
  HEAP32[$head31>>2] = $or32;
  _dispose_chunk($add$ptr17,$sub);
  $newp$2 = $p;
  return ($newp$2|0);
 }
 $5 = HEAP32[(3752)>>2]|0;
 $cmp34 = ($add$ptr|0)==($5|0);
 if ($cmp34) {
  $6 = HEAP32[(3740)>>2]|0;
  $add = (($6) + ($and))|0;
  $cmp36 = ($add>>>0)>($nb>>>0);
  $sub40 = (($add) - ($nb))|0;
  $add$ptr41 = (($p) + ($nb)|0);
  if (!($cmp36)) {
   $newp$2 = 0;
   return ($newp$2|0);
  }
  $or50 = $sub40 | 1;
  $head48 = ((($add$ptr41)) + 4|0);
  $and43 = $0 & 1;
  $or44 = $and43 | $nb;
  $or45 = $or44 | 2;
  HEAP32[$head>>2] = $or45;
  HEAP32[$head48>>2] = $or50;
  HEAP32[(3752)>>2] = $add$ptr41;
  HEAP32[(3740)>>2] = $sub40;
  $newp$2 = $p;
  return ($newp$2|0);
 }
 $7 = HEAP32[(3748)>>2]|0;
 $cmp56 = ($add$ptr|0)==($7|0);
 if ($cmp56) {
  $8 = HEAP32[(3736)>>2]|0;
  $add58 = (($8) + ($and))|0;
  $cmp59 = ($add58>>>0)<($nb>>>0);
  if ($cmp59) {
   $newp$2 = 0;
   return ($newp$2|0);
  }
  $sub62 = (($add58) - ($nb))|0;
  $cmp63 = ($sub62>>>0)>(15);
  $and69 = $0 & 1;
  if ($cmp63) {
   $add$ptr66 = (($p) + ($nb)|0);
   $add$ptr67 = (($add$ptr66) + ($sub62)|0);
   $or70 = $and69 | $nb;
   $or71 = $or70 | 2;
   HEAP32[$head>>2] = $or71;
   $head74 = ((($add$ptr66)) + 4|0);
   $or76 = $sub62 | 1;
   HEAP32[$head74>>2] = $or76;
   HEAP32[$add$ptr67>>2] = $sub62;
   $head79 = ((($add$ptr67)) + 4|0);
   $9 = HEAP32[$head79>>2]|0;
   $and80 = $9 & -2;
   HEAP32[$head79>>2] = $and80;
   $storemerge = $add$ptr66;$storemerge1 = $sub62;
  } else {
   $or88 = $and69 | $add58;
   $or89 = $or88 | 2;
   HEAP32[$head>>2] = $or89;
   $add$ptr91 = (($p) + ($add58)|0);
   $head92 = ((($add$ptr91)) + 4|0);
   $10 = HEAP32[$head92>>2]|0;
   $or93 = $10 | 1;
   HEAP32[$head92>>2] = $or93;
   $storemerge = 0;$storemerge1 = 0;
  }
  HEAP32[(3736)>>2] = $storemerge1;
  HEAP32[(3748)>>2] = $storemerge;
  $newp$2 = $p;
  return ($newp$2|0);
 }
 $and100 = $2 & 2;
 $tobool101 = ($and100|0)==(0);
 if (!($tobool101)) {
  $newp$2 = 0;
  return ($newp$2|0);
 }
 $and104 = $2 & -8;
 $add105 = (($and104) + ($and))|0;
 $cmp106 = ($add105>>>0)<($nb>>>0);
 if ($cmp106) {
  $newp$2 = 0;
  return ($newp$2|0);
 }
 $sub110 = (($add105) - ($nb))|0;
 $shr = $2 >>> 3;
 $cmp111 = ($2>>>0)<(256);
 L49: do {
  if ($cmp111) {
   $fd = ((($add$ptr)) + 8|0);
   $11 = HEAP32[$fd>>2]|0;
   $bk = ((($add$ptr)) + 12|0);
   $12 = HEAP32[$bk>>2]|0;
   $shl = $shr << 1;
   $arrayidx = (3768 + ($shl<<2)|0);
   $cmp114 = ($11|0)==($arrayidx|0);
   if (!($cmp114)) {
    $cmp116 = ($11>>>0)<($1>>>0);
    if ($cmp116) {
     _abort();
     // unreachable;
    }
    $bk118 = ((($11)) + 12|0);
    $13 = HEAP32[$bk118>>2]|0;
    $cmp119 = ($13|0)==($add$ptr|0);
    if (!($cmp119)) {
     _abort();
     // unreachable;
    }
   }
   $cmp125 = ($12|0)==($11|0);
   if ($cmp125) {
    $shl127 = 1 << $shr;
    $neg = $shl127 ^ -1;
    $14 = HEAP32[932]|0;
    $and128 = $14 & $neg;
    HEAP32[932] = $and128;
    break;
   }
   $cmp133 = ($12|0)==($arrayidx|0);
   if ($cmp133) {
    $$pre = ((($12)) + 8|0);
    $fd148$pre$phiZ2D = $$pre;
   } else {
    $cmp136 = ($12>>>0)<($1>>>0);
    if ($cmp136) {
     _abort();
     // unreachable;
    }
    $fd138 = ((($12)) + 8|0);
    $15 = HEAP32[$fd138>>2]|0;
    $cmp139 = ($15|0)==($add$ptr|0);
    if ($cmp139) {
     $fd148$pre$phiZ2D = $fd138;
    } else {
     _abort();
     // unreachable;
    }
   }
   $bk147 = ((($11)) + 12|0);
   HEAP32[$bk147>>2] = $12;
   HEAP32[$fd148$pre$phiZ2D>>2] = $11;
  } else {
   $parent = ((($add$ptr)) + 24|0);
   $16 = HEAP32[$parent>>2]|0;
   $bk155 = ((($add$ptr)) + 12|0);
   $17 = HEAP32[$bk155>>2]|0;
   $cmp156 = ($17|0)==($add$ptr|0);
   do {
    if ($cmp156) {
     $child = ((($add$ptr)) + 16|0);
     $arrayidx179 = ((($child)) + 4|0);
     $21 = HEAP32[$arrayidx179>>2]|0;
     $cmp180 = ($21|0)==(0|0);
     if ($cmp180) {
      $22 = HEAP32[$child>>2]|0;
      $cmp183 = ($22|0)==(0|0);
      if ($cmp183) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $22;$RP$1 = $child;
      }
     } else {
      $R$1 = $21;$RP$1 = $arrayidx179;
     }
     while(1) {
      $arrayidx186 = ((($R$1)) + 20|0);
      $23 = HEAP32[$arrayidx186>>2]|0;
      $cmp187 = ($23|0)==(0|0);
      if (!($cmp187)) {
       $R$1 = $23;$RP$1 = $arrayidx186;
       continue;
      }
      $arrayidx190 = ((($R$1)) + 16|0);
      $24 = HEAP32[$arrayidx190>>2]|0;
      $cmp191 = ($24|0)==(0|0);
      if ($cmp191) {
       break;
      } else {
       $R$1 = $24;$RP$1 = $arrayidx190;
      }
     }
     $cmp195 = ($RP$1>>>0)<($1>>>0);
     if ($cmp195) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1>>2] = 0;
      $R$3 = $R$1;
      break;
     }
    } else {
     $fd159 = ((($add$ptr)) + 8|0);
     $18 = HEAP32[$fd159>>2]|0;
     $cmp162 = ($18>>>0)<($1>>>0);
     if ($cmp162) {
      _abort();
      // unreachable;
     }
     $bk164 = ((($18)) + 12|0);
     $19 = HEAP32[$bk164>>2]|0;
     $cmp165 = ($19|0)==($add$ptr|0);
     if (!($cmp165)) {
      _abort();
      // unreachable;
     }
     $fd167 = ((($17)) + 8|0);
     $20 = HEAP32[$fd167>>2]|0;
     $cmp168 = ($20|0)==($add$ptr|0);
     if ($cmp168) {
      HEAP32[$bk164>>2] = $17;
      HEAP32[$fd167>>2] = $18;
      $R$3 = $17;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $cmp203 = ($16|0)==(0|0);
   if (!($cmp203)) {
    $index = ((($add$ptr)) + 28|0);
    $25 = HEAP32[$index>>2]|0;
    $arrayidx206 = (4032 + ($25<<2)|0);
    $26 = HEAP32[$arrayidx206>>2]|0;
    $cmp207 = ($add$ptr|0)==($26|0);
    do {
     if ($cmp207) {
      HEAP32[$arrayidx206>>2] = $R$3;
      $cond = ($R$3|0)==(0|0);
      if ($cond) {
       $shl214 = 1 << $25;
       $neg215 = $shl214 ^ -1;
       $27 = HEAP32[(3732)>>2]|0;
       $and216 = $27 & $neg215;
       HEAP32[(3732)>>2] = $and216;
       break L49;
      }
     } else {
      $28 = HEAP32[(3744)>>2]|0;
      $cmp220 = ($16>>>0)<($28>>>0);
      if ($cmp220) {
       _abort();
       // unreachable;
      } else {
       $arrayidx226 = ((($16)) + 16|0);
       $29 = HEAP32[$arrayidx226>>2]|0;
       $not$cmp227 = ($29|0)!=($add$ptr|0);
       $$sink = $not$cmp227&1;
       $arrayidx234 = (((($16)) + 16|0) + ($$sink<<2)|0);
       HEAP32[$arrayidx234>>2] = $R$3;
       $cmp239 = ($R$3|0)==(0|0);
       if ($cmp239) {
        break L49;
       } else {
        break;
       }
      }
     }
    } while(0);
    $30 = HEAP32[(3744)>>2]|0;
    $cmp243 = ($R$3>>>0)<($30>>>0);
    if ($cmp243) {
     _abort();
     // unreachable;
    }
    $parent248 = ((($R$3)) + 24|0);
    HEAP32[$parent248>>2] = $16;
    $child249 = ((($add$ptr)) + 16|0);
    $31 = HEAP32[$child249>>2]|0;
    $cmp251 = ($31|0)==(0|0);
    do {
     if (!($cmp251)) {
      $cmp255 = ($31>>>0)<($30>>>0);
      if ($cmp255) {
       _abort();
       // unreachable;
      } else {
       $arrayidx261 = ((($R$3)) + 16|0);
       HEAP32[$arrayidx261>>2] = $31;
       $parent262 = ((($31)) + 24|0);
       HEAP32[$parent262>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $arrayidx267 = ((($child249)) + 4|0);
    $32 = HEAP32[$arrayidx267>>2]|0;
    $cmp268 = ($32|0)==(0|0);
    if (!($cmp268)) {
     $33 = HEAP32[(3744)>>2]|0;
     $cmp272 = ($32>>>0)<($33>>>0);
     if ($cmp272) {
      _abort();
      // unreachable;
     } else {
      $arrayidx278 = ((($R$3)) + 20|0);
      HEAP32[$arrayidx278>>2] = $32;
      $parent279 = ((($32)) + 24|0);
      HEAP32[$parent279>>2] = $R$3;
      break;
     }
    }
   }
  }
 } while(0);
 $cmp288 = ($sub110>>>0)<(16);
 $and294 = $0 & 1;
 if ($cmp288) {
  $or295 = $add105 | $and294;
  $or296 = $or295 | 2;
  HEAP32[$head>>2] = $or296;
  $add$ptr298 = (($p) + ($add105)|0);
  $head299 = ((($add$ptr298)) + 4|0);
  $34 = HEAP32[$head299>>2]|0;
  $or300 = $34 | 1;
  HEAP32[$head299>>2] = $or300;
  $newp$2 = $p;
  return ($newp$2|0);
 } else {
  $add$ptr303 = (($p) + ($nb)|0);
  $or306 = $and294 | $nb;
  $or307 = $or306 | 2;
  HEAP32[$head>>2] = $or307;
  $head310 = ((($add$ptr303)) + 4|0);
  $or315 = $sub110 | 3;
  HEAP32[$head310>>2] = $or315;
  $add$ptr317 = (($add$ptr303) + ($sub110)|0);
  $head318 = ((($add$ptr317)) + 4|0);
  $35 = HEAP32[$head318>>2]|0;
  $or319 = $35 | 1;
  HEAP32[$head318>>2] = $or319;
  _dispose_chunk($add$ptr303,$sub110);
  $newp$2 = $p;
  return ($newp$2|0);
 }
 return (0)|0;
}
function _dispose_chunk($p,$psize) {
 $p = $p|0;
 $psize = $psize|0;
 var $$pre = 0, $$pre$phiZ2D = 0, $$pre8 = 0, $$pre9 = 0, $$sink = 0, $$sink3 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0;
 var $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0;
 var $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $8 = 0, $9 = 0, $F517$0 = 0, $I545$0 = 0, $K597$0 = 0, $R$1 = 0;
 var $R$3 = 0, $R328$1 = 0, $R328$3 = 0, $RP$1 = 0, $RP357$1 = 0, $T$0 = 0, $add$ptr = 0, $add$ptr209 = 0, $add$ptr252 = 0, $add$ptr486 = 0, $add$ptr5 = 0, $add$ptr504 = 0, $add230 = 0, $add248 = 0, $add258 = 0, $add561 = 0, $add566 = 0, $add570 = 0, $add572 = 0, $add575 = 0;
 var $add6 = 0, $and = 0, $and128 = 0, $and2 = 0, $and202 = 0, $and207 = 0, $and224 = 0, $and257 = 0, $and295 = 0, $and32 = 0, $and410 = 0, $and501 = 0, $and520 = 0, $and556 = 0, $and560 = 0, $and565 = 0, $and574 = 0, $and587 = 0, $and606 = 0, $arrayidx = 0;
 var $arrayidx100 = 0, $arrayidx118 = 0, $arrayidx138 = 0, $arrayidx146 = 0, $arrayidx173 = 0, $arrayidx179 = 0, $arrayidx190 = 0, $arrayidx271 = 0, $arrayidx359 = 0, $arrayidx371 = 0, $arrayidx376 = 0, $arrayidx399 = 0, $arrayidx420 = 0, $arrayidx428 = 0, $arrayidx457 = 0, $arrayidx463 = 0, $arrayidx474 = 0, $arrayidx516 = 0, $arrayidx579 = 0, $arrayidx582 = 0;
 var $arrayidx613 = 0, $arrayidx86 = 0, $arrayidx95 = 0, $bk = 0, $bk22 = 0, $bk266 = 0, $bk279 = 0, $bk317 = 0, $bk329 = 0, $bk340 = 0, $bk52 = 0, $bk539 = 0, $bk541 = 0, $bk594 = 0, $bk60 = 0, $bk626 = 0, $bk648 = 0, $bk651 = 0, $bk70 = 0, $child = 0;
 var $child161 = 0, $child358 = 0, $child445 = 0, $child581 = 0, $cmp = 0, $cmp10 = 0, $cmp101 = 0, $cmp106 = 0, $cmp115 = 0, $cmp119 = 0, $cmp13 = 0, $cmp132 = 0, $cmp151 = 0, $cmp155 = 0, $cmp163 = 0, $cmp167 = 0, $cmp17 = 0, $cmp180 = 0, $cmp184 = 0, $cmp20 = 0;
 var $cmp203 = 0, $cmp218 = 0, $cmp227 = 0, $cmp23 = 0, $cmp235 = 0, $cmp244 = 0, $cmp260 = 0, $cmp272 = 0, $cmp276 = 0, $cmp28 = 0, $cmp280 = 0, $cmp289 = 0, $cmp300 = 0, $cmp304 = 0, $cmp308 = 0, $cmp330 = 0, $cmp337 = 0, $cmp341 = 0, $cmp345 = 0, $cmp36 = 0;
 var $cmp360 = 0, $cmp365 = 0, $cmp372 = 0, $cmp377 = 0, $cmp384 = 0, $cmp393 = 0, $cmp40 = 0, $cmp400 = 0, $cmp414 = 0, $cmp433 = 0, $cmp437 = 0, $cmp44 = 0, $cmp447 = 0, $cmp451 = 0, $cmp464 = 0, $cmp468 = 0, $cmp489 = 0, $cmp508 = 0, $cmp529 = 0, $cmp547 = 0;
 var $cmp551 = 0, $cmp598 = 0, $cmp607 = 0, $cmp61 = 0, $cmp615 = 0, $cmp620 = 0, $cmp641 = 0, $cmp68 = 0, $cmp7 = 0, $cmp71 = 0, $cmp75 = 0, $cmp87 = 0, $cmp91 = 0, $cmp96 = 0, $cond = 0, $cond4 = 0, $cond5 = 0, $fd = 0, $fd264 = 0, $fd307 = 0;
 var $fd318$pre$phiZ2D = 0, $fd334 = 0, $fd344 = 0, $fd43 = 0, $fd53$pre$phiZ2D = 0, $fd540 = 0, $fd595 = 0, $fd627 = 0, $fd635 = 0, $fd65 = 0, $fd650 = 0, $fd74 = 0, $head = 0, $head201 = 0, $head208 = 0, $head223 = 0, $head233 = 0, $head251 = 0, $head485 = 0, $head503 = 0;
 var $head605 = 0, $idx$neg = 0, $index = 0, $index398 = 0, $index580 = 0, $neg = 0, $neg127 = 0, $neg293 = 0, $neg408 = 0, $not$cmp139 = 0, $not$cmp421 = 0, $not$cmp637 = 0, $or = 0, $or232 = 0, $or250 = 0, $or484 = 0, $or502 = 0, $or525 = 0, $or592 = 0, $p$addr$1 = 0;
 var $parent = 0, $parent160 = 0, $parent174 = 0, $parent191 = 0, $parent327 = 0, $parent444 = 0, $parent458 = 0, $parent475 = 0, $parent593 = 0, $parent625 = 0, $parent652 = 0, $psize$addr$1 = 0, $psize$addr$2 = 0, $shl = 0, $shl126 = 0, $shl270 = 0, $shl292 = 0, $shl31 = 0, $shl407 = 0, $shl515 = 0;
 var $shl519 = 0, $shl557 = 0, $shl562 = 0, $shl568 = 0, $shl571 = 0, $shl586 = 0, $shl604 = 0, $shl614 = 0, $shr = 0, $shr259 = 0, $shr507 = 0, $shr546 = 0, $shr555 = 0, $shr559 = 0, $shr564 = 0, $shr569 = 0, $shr573 = 0, $shr600 = 0, $shr611 = 0, $sub = 0;
 var $sub558 = 0, $sub563 = 0, $sub567 = 0, $sub603 = 0, $tobool = 0, $tobool225 = 0, $tobool521 = 0, $tobool588 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $add$ptr = (($p) + ($psize)|0);
 $head = ((($p)) + 4|0);
 $0 = HEAP32[$head>>2]|0;
 $and = $0 & 1;
 $tobool = ($and|0)==(0);
 L1: do {
  if ($tobool) {
   $1 = HEAP32[$p>>2]|0;
   $and2 = $0 & 3;
   $cmp = ($and2|0)==(0);
   if ($cmp) {
    return;
   }
   $idx$neg = (0 - ($1))|0;
   $add$ptr5 = (($p) + ($idx$neg)|0);
   $add6 = (($1) + ($psize))|0;
   $2 = HEAP32[(3744)>>2]|0;
   $cmp7 = ($add$ptr5>>>0)<($2>>>0);
   if ($cmp7) {
    _abort();
    // unreachable;
   }
   $3 = HEAP32[(3748)>>2]|0;
   $cmp10 = ($add$ptr5|0)==($3|0);
   if ($cmp10) {
    $head201 = ((($add$ptr)) + 4|0);
    $27 = HEAP32[$head201>>2]|0;
    $and202 = $27 & 3;
    $cmp203 = ($and202|0)==(3);
    if (!($cmp203)) {
     $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
     break;
    }
    $add$ptr209 = (($add$ptr5) + ($add6)|0);
    $head208 = ((($add$ptr5)) + 4|0);
    $or = $add6 | 1;
    $and207 = $27 & -2;
    HEAP32[(3736)>>2] = $add6;
    HEAP32[$head201>>2] = $and207;
    HEAP32[$head208>>2] = $or;
    HEAP32[$add$ptr209>>2] = $add6;
    return;
   }
   $shr = $1 >>> 3;
   $cmp13 = ($1>>>0)<(256);
   if ($cmp13) {
    $fd = ((($add$ptr5)) + 8|0);
    $4 = HEAP32[$fd>>2]|0;
    $bk = ((($add$ptr5)) + 12|0);
    $5 = HEAP32[$bk>>2]|0;
    $shl = $shr << 1;
    $arrayidx = (3768 + ($shl<<2)|0);
    $cmp17 = ($4|0)==($arrayidx|0);
    if (!($cmp17)) {
     $cmp20 = ($4>>>0)<($2>>>0);
     if ($cmp20) {
      _abort();
      // unreachable;
     }
     $bk22 = ((($4)) + 12|0);
     $6 = HEAP32[$bk22>>2]|0;
     $cmp23 = ($6|0)==($add$ptr5|0);
     if (!($cmp23)) {
      _abort();
      // unreachable;
     }
    }
    $cmp28 = ($5|0)==($4|0);
    if ($cmp28) {
     $shl31 = 1 << $shr;
     $neg = $shl31 ^ -1;
     $7 = HEAP32[932]|0;
     $and32 = $7 & $neg;
     HEAP32[932] = $and32;
     $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
     break;
    }
    $cmp36 = ($5|0)==($arrayidx|0);
    if ($cmp36) {
     $$pre9 = ((($5)) + 8|0);
     $fd53$pre$phiZ2D = $$pre9;
    } else {
     $cmp40 = ($5>>>0)<($2>>>0);
     if ($cmp40) {
      _abort();
      // unreachable;
     }
     $fd43 = ((($5)) + 8|0);
     $8 = HEAP32[$fd43>>2]|0;
     $cmp44 = ($8|0)==($add$ptr5|0);
     if ($cmp44) {
      $fd53$pre$phiZ2D = $fd43;
     } else {
      _abort();
      // unreachable;
     }
    }
    $bk52 = ((($4)) + 12|0);
    HEAP32[$bk52>>2] = $5;
    HEAP32[$fd53$pre$phiZ2D>>2] = $4;
    $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
    break;
   }
   $parent = ((($add$ptr5)) + 24|0);
   $9 = HEAP32[$parent>>2]|0;
   $bk60 = ((($add$ptr5)) + 12|0);
   $10 = HEAP32[$bk60>>2]|0;
   $cmp61 = ($10|0)==($add$ptr5|0);
   do {
    if ($cmp61) {
     $child = ((($add$ptr5)) + 16|0);
     $arrayidx86 = ((($child)) + 4|0);
     $14 = HEAP32[$arrayidx86>>2]|0;
     $cmp87 = ($14|0)==(0|0);
     if ($cmp87) {
      $15 = HEAP32[$child>>2]|0;
      $cmp91 = ($15|0)==(0|0);
      if ($cmp91) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $15;$RP$1 = $child;
      }
     } else {
      $R$1 = $14;$RP$1 = $arrayidx86;
     }
     while(1) {
      $arrayidx95 = ((($R$1)) + 20|0);
      $16 = HEAP32[$arrayidx95>>2]|0;
      $cmp96 = ($16|0)==(0|0);
      if (!($cmp96)) {
       $R$1 = $16;$RP$1 = $arrayidx95;
       continue;
      }
      $arrayidx100 = ((($R$1)) + 16|0);
      $17 = HEAP32[$arrayidx100>>2]|0;
      $cmp101 = ($17|0)==(0|0);
      if ($cmp101) {
       break;
      } else {
       $R$1 = $17;$RP$1 = $arrayidx100;
      }
     }
     $cmp106 = ($RP$1>>>0)<($2>>>0);
     if ($cmp106) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1>>2] = 0;
      $R$3 = $R$1;
      break;
     }
    } else {
     $fd65 = ((($add$ptr5)) + 8|0);
     $11 = HEAP32[$fd65>>2]|0;
     $cmp68 = ($11>>>0)<($2>>>0);
     if ($cmp68) {
      _abort();
      // unreachable;
     }
     $bk70 = ((($11)) + 12|0);
     $12 = HEAP32[$bk70>>2]|0;
     $cmp71 = ($12|0)==($add$ptr5|0);
     if (!($cmp71)) {
      _abort();
      // unreachable;
     }
     $fd74 = ((($10)) + 8|0);
     $13 = HEAP32[$fd74>>2]|0;
     $cmp75 = ($13|0)==($add$ptr5|0);
     if ($cmp75) {
      HEAP32[$bk70>>2] = $10;
      HEAP32[$fd74>>2] = $11;
      $R$3 = $10;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $cmp115 = ($9|0)==(0|0);
   if ($cmp115) {
    $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
   } else {
    $index = ((($add$ptr5)) + 28|0);
    $18 = HEAP32[$index>>2]|0;
    $arrayidx118 = (4032 + ($18<<2)|0);
    $19 = HEAP32[$arrayidx118>>2]|0;
    $cmp119 = ($add$ptr5|0)==($19|0);
    do {
     if ($cmp119) {
      HEAP32[$arrayidx118>>2] = $R$3;
      $cond4 = ($R$3|0)==(0|0);
      if ($cond4) {
       $shl126 = 1 << $18;
       $neg127 = $shl126 ^ -1;
       $20 = HEAP32[(3732)>>2]|0;
       $and128 = $20 & $neg127;
       HEAP32[(3732)>>2] = $and128;
       $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
       break L1;
      }
     } else {
      $21 = HEAP32[(3744)>>2]|0;
      $cmp132 = ($9>>>0)<($21>>>0);
      if ($cmp132) {
       _abort();
       // unreachable;
      } else {
       $arrayidx138 = ((($9)) + 16|0);
       $22 = HEAP32[$arrayidx138>>2]|0;
       $not$cmp139 = ($22|0)!=($add$ptr5|0);
       $$sink = $not$cmp139&1;
       $arrayidx146 = (((($9)) + 16|0) + ($$sink<<2)|0);
       HEAP32[$arrayidx146>>2] = $R$3;
       $cmp151 = ($R$3|0)==(0|0);
       if ($cmp151) {
        $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
        break L1;
       } else {
        break;
       }
      }
     }
    } while(0);
    $23 = HEAP32[(3744)>>2]|0;
    $cmp155 = ($R$3>>>0)<($23>>>0);
    if ($cmp155) {
     _abort();
     // unreachable;
    }
    $parent160 = ((($R$3)) + 24|0);
    HEAP32[$parent160>>2] = $9;
    $child161 = ((($add$ptr5)) + 16|0);
    $24 = HEAP32[$child161>>2]|0;
    $cmp163 = ($24|0)==(0|0);
    do {
     if (!($cmp163)) {
      $cmp167 = ($24>>>0)<($23>>>0);
      if ($cmp167) {
       _abort();
       // unreachable;
      } else {
       $arrayidx173 = ((($R$3)) + 16|0);
       HEAP32[$arrayidx173>>2] = $24;
       $parent174 = ((($24)) + 24|0);
       HEAP32[$parent174>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $arrayidx179 = ((($child161)) + 4|0);
    $25 = HEAP32[$arrayidx179>>2]|0;
    $cmp180 = ($25|0)==(0|0);
    if ($cmp180) {
     $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
    } else {
     $26 = HEAP32[(3744)>>2]|0;
     $cmp184 = ($25>>>0)<($26>>>0);
     if ($cmp184) {
      _abort();
      // unreachable;
     } else {
      $arrayidx190 = ((($R$3)) + 20|0);
      HEAP32[$arrayidx190>>2] = $25;
      $parent191 = ((($25)) + 24|0);
      HEAP32[$parent191>>2] = $R$3;
      $p$addr$1 = $add$ptr5;$psize$addr$1 = $add6;
      break;
     }
    }
   }
  } else {
   $p$addr$1 = $p;$psize$addr$1 = $psize;
  }
 } while(0);
 $28 = HEAP32[(3744)>>2]|0;
 $cmp218 = ($add$ptr>>>0)<($28>>>0);
 if ($cmp218) {
  _abort();
  // unreachable;
 }
 $head223 = ((($add$ptr)) + 4|0);
 $29 = HEAP32[$head223>>2]|0;
 $and224 = $29 & 2;
 $tobool225 = ($and224|0)==(0);
 if ($tobool225) {
  $30 = HEAP32[(3752)>>2]|0;
  $cmp227 = ($add$ptr|0)==($30|0);
  $31 = HEAP32[(3748)>>2]|0;
  if ($cmp227) {
   $32 = HEAP32[(3740)>>2]|0;
   $add230 = (($32) + ($psize$addr$1))|0;
   HEAP32[(3740)>>2] = $add230;
   HEAP32[(3752)>>2] = $p$addr$1;
   $or232 = $add230 | 1;
   $head233 = ((($p$addr$1)) + 4|0);
   HEAP32[$head233>>2] = $or232;
   $cmp235 = ($p$addr$1|0)==($31|0);
   if (!($cmp235)) {
    return;
   }
   HEAP32[(3748)>>2] = 0;
   HEAP32[(3736)>>2] = 0;
   return;
  }
  $cmp244 = ($add$ptr|0)==($31|0);
  if ($cmp244) {
   $33 = HEAP32[(3736)>>2]|0;
   $add248 = (($33) + ($psize$addr$1))|0;
   HEAP32[(3736)>>2] = $add248;
   HEAP32[(3748)>>2] = $p$addr$1;
   $or250 = $add248 | 1;
   $head251 = ((($p$addr$1)) + 4|0);
   HEAP32[$head251>>2] = $or250;
   $add$ptr252 = (($p$addr$1) + ($add248)|0);
   HEAP32[$add$ptr252>>2] = $add248;
   return;
  }
  $and257 = $29 & -8;
  $add258 = (($and257) + ($psize$addr$1))|0;
  $shr259 = $29 >>> 3;
  $cmp260 = ($29>>>0)<(256);
  L96: do {
   if ($cmp260) {
    $fd264 = ((($add$ptr)) + 8|0);
    $34 = HEAP32[$fd264>>2]|0;
    $bk266 = ((($add$ptr)) + 12|0);
    $35 = HEAP32[$bk266>>2]|0;
    $shl270 = $shr259 << 1;
    $arrayidx271 = (3768 + ($shl270<<2)|0);
    $cmp272 = ($34|0)==($arrayidx271|0);
    if (!($cmp272)) {
     $cmp276 = ($34>>>0)<($28>>>0);
     if ($cmp276) {
      _abort();
      // unreachable;
     }
     $bk279 = ((($34)) + 12|0);
     $36 = HEAP32[$bk279>>2]|0;
     $cmp280 = ($36|0)==($add$ptr|0);
     if (!($cmp280)) {
      _abort();
      // unreachable;
     }
    }
    $cmp289 = ($35|0)==($34|0);
    if ($cmp289) {
     $shl292 = 1 << $shr259;
     $neg293 = $shl292 ^ -1;
     $37 = HEAP32[932]|0;
     $and295 = $37 & $neg293;
     HEAP32[932] = $and295;
     break;
    }
    $cmp300 = ($35|0)==($arrayidx271|0);
    if ($cmp300) {
     $$pre8 = ((($35)) + 8|0);
     $fd318$pre$phiZ2D = $$pre8;
    } else {
     $cmp304 = ($35>>>0)<($28>>>0);
     if ($cmp304) {
      _abort();
      // unreachable;
     }
     $fd307 = ((($35)) + 8|0);
     $38 = HEAP32[$fd307>>2]|0;
     $cmp308 = ($38|0)==($add$ptr|0);
     if ($cmp308) {
      $fd318$pre$phiZ2D = $fd307;
     } else {
      _abort();
      // unreachable;
     }
    }
    $bk317 = ((($34)) + 12|0);
    HEAP32[$bk317>>2] = $35;
    HEAP32[$fd318$pre$phiZ2D>>2] = $34;
   } else {
    $parent327 = ((($add$ptr)) + 24|0);
    $39 = HEAP32[$parent327>>2]|0;
    $bk329 = ((($add$ptr)) + 12|0);
    $40 = HEAP32[$bk329>>2]|0;
    $cmp330 = ($40|0)==($add$ptr|0);
    do {
     if ($cmp330) {
      $child358 = ((($add$ptr)) + 16|0);
      $arrayidx359 = ((($child358)) + 4|0);
      $44 = HEAP32[$arrayidx359>>2]|0;
      $cmp360 = ($44|0)==(0|0);
      if ($cmp360) {
       $45 = HEAP32[$child358>>2]|0;
       $cmp365 = ($45|0)==(0|0);
       if ($cmp365) {
        $R328$3 = 0;
        break;
       } else {
        $R328$1 = $45;$RP357$1 = $child358;
       }
      } else {
       $R328$1 = $44;$RP357$1 = $arrayidx359;
      }
      while(1) {
       $arrayidx371 = ((($R328$1)) + 20|0);
       $46 = HEAP32[$arrayidx371>>2]|0;
       $cmp372 = ($46|0)==(0|0);
       if (!($cmp372)) {
        $R328$1 = $46;$RP357$1 = $arrayidx371;
        continue;
       }
       $arrayidx376 = ((($R328$1)) + 16|0);
       $47 = HEAP32[$arrayidx376>>2]|0;
       $cmp377 = ($47|0)==(0|0);
       if ($cmp377) {
        break;
       } else {
        $R328$1 = $47;$RP357$1 = $arrayidx376;
       }
      }
      $cmp384 = ($RP357$1>>>0)<($28>>>0);
      if ($cmp384) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP357$1>>2] = 0;
       $R328$3 = $R328$1;
       break;
      }
     } else {
      $fd334 = ((($add$ptr)) + 8|0);
      $41 = HEAP32[$fd334>>2]|0;
      $cmp337 = ($41>>>0)<($28>>>0);
      if ($cmp337) {
       _abort();
       // unreachable;
      }
      $bk340 = ((($41)) + 12|0);
      $42 = HEAP32[$bk340>>2]|0;
      $cmp341 = ($42|0)==($add$ptr|0);
      if (!($cmp341)) {
       _abort();
       // unreachable;
      }
      $fd344 = ((($40)) + 8|0);
      $43 = HEAP32[$fd344>>2]|0;
      $cmp345 = ($43|0)==($add$ptr|0);
      if ($cmp345) {
       HEAP32[$bk340>>2] = $40;
       HEAP32[$fd344>>2] = $41;
       $R328$3 = $40;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $cmp393 = ($39|0)==(0|0);
    if (!($cmp393)) {
     $index398 = ((($add$ptr)) + 28|0);
     $48 = HEAP32[$index398>>2]|0;
     $arrayidx399 = (4032 + ($48<<2)|0);
     $49 = HEAP32[$arrayidx399>>2]|0;
     $cmp400 = ($add$ptr|0)==($49|0);
     do {
      if ($cmp400) {
       HEAP32[$arrayidx399>>2] = $R328$3;
       $cond5 = ($R328$3|0)==(0|0);
       if ($cond5) {
        $shl407 = 1 << $48;
        $neg408 = $shl407 ^ -1;
        $50 = HEAP32[(3732)>>2]|0;
        $and410 = $50 & $neg408;
        HEAP32[(3732)>>2] = $and410;
        break L96;
       }
      } else {
       $51 = HEAP32[(3744)>>2]|0;
       $cmp414 = ($39>>>0)<($51>>>0);
       if ($cmp414) {
        _abort();
        // unreachable;
       } else {
        $arrayidx420 = ((($39)) + 16|0);
        $52 = HEAP32[$arrayidx420>>2]|0;
        $not$cmp421 = ($52|0)!=($add$ptr|0);
        $$sink3 = $not$cmp421&1;
        $arrayidx428 = (((($39)) + 16|0) + ($$sink3<<2)|0);
        HEAP32[$arrayidx428>>2] = $R328$3;
        $cmp433 = ($R328$3|0)==(0|0);
        if ($cmp433) {
         break L96;
        } else {
         break;
        }
       }
      }
     } while(0);
     $53 = HEAP32[(3744)>>2]|0;
     $cmp437 = ($R328$3>>>0)<($53>>>0);
     if ($cmp437) {
      _abort();
      // unreachable;
     }
     $parent444 = ((($R328$3)) + 24|0);
     HEAP32[$parent444>>2] = $39;
     $child445 = ((($add$ptr)) + 16|0);
     $54 = HEAP32[$child445>>2]|0;
     $cmp447 = ($54|0)==(0|0);
     do {
      if (!($cmp447)) {
       $cmp451 = ($54>>>0)<($53>>>0);
       if ($cmp451) {
        _abort();
        // unreachable;
       } else {
        $arrayidx457 = ((($R328$3)) + 16|0);
        HEAP32[$arrayidx457>>2] = $54;
        $parent458 = ((($54)) + 24|0);
        HEAP32[$parent458>>2] = $R328$3;
        break;
       }
      }
     } while(0);
     $arrayidx463 = ((($child445)) + 4|0);
     $55 = HEAP32[$arrayidx463>>2]|0;
     $cmp464 = ($55|0)==(0|0);
     if (!($cmp464)) {
      $56 = HEAP32[(3744)>>2]|0;
      $cmp468 = ($55>>>0)<($56>>>0);
      if ($cmp468) {
       _abort();
       // unreachable;
      } else {
       $arrayidx474 = ((($R328$3)) + 20|0);
       HEAP32[$arrayidx474>>2] = $55;
       $parent475 = ((($55)) + 24|0);
       HEAP32[$parent475>>2] = $R328$3;
       break;
      }
     }
    }
   }
  } while(0);
  $or484 = $add258 | 1;
  $head485 = ((($p$addr$1)) + 4|0);
  HEAP32[$head485>>2] = $or484;
  $add$ptr486 = (($p$addr$1) + ($add258)|0);
  HEAP32[$add$ptr486>>2] = $add258;
  $57 = HEAP32[(3748)>>2]|0;
  $cmp489 = ($p$addr$1|0)==($57|0);
  if ($cmp489) {
   HEAP32[(3736)>>2] = $add258;
   return;
  } else {
   $psize$addr$2 = $add258;
  }
 } else {
  $and501 = $29 & -2;
  HEAP32[$head223>>2] = $and501;
  $or502 = $psize$addr$1 | 1;
  $head503 = ((($p$addr$1)) + 4|0);
  HEAP32[$head503>>2] = $or502;
  $add$ptr504 = (($p$addr$1) + ($psize$addr$1)|0);
  HEAP32[$add$ptr504>>2] = $psize$addr$1;
  $psize$addr$2 = $psize$addr$1;
 }
 $shr507 = $psize$addr$2 >>> 3;
 $cmp508 = ($psize$addr$2>>>0)<(256);
 if ($cmp508) {
  $shl515 = $shr507 << 1;
  $arrayidx516 = (3768 + ($shl515<<2)|0);
  $58 = HEAP32[932]|0;
  $shl519 = 1 << $shr507;
  $and520 = $58 & $shl519;
  $tobool521 = ($and520|0)==(0);
  if ($tobool521) {
   $or525 = $58 | $shl519;
   HEAP32[932] = $or525;
   $$pre = ((($arrayidx516)) + 8|0);
   $$pre$phiZ2D = $$pre;$F517$0 = $arrayidx516;
  } else {
   $59 = ((($arrayidx516)) + 8|0);
   $60 = HEAP32[$59>>2]|0;
   $61 = HEAP32[(3744)>>2]|0;
   $cmp529 = ($60>>>0)<($61>>>0);
   if ($cmp529) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $59;$F517$0 = $60;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$addr$1;
  $bk539 = ((($F517$0)) + 12|0);
  HEAP32[$bk539>>2] = $p$addr$1;
  $fd540 = ((($p$addr$1)) + 8|0);
  HEAP32[$fd540>>2] = $F517$0;
  $bk541 = ((($p$addr$1)) + 12|0);
  HEAP32[$bk541>>2] = $arrayidx516;
  return;
 }
 $shr546 = $psize$addr$2 >>> 8;
 $cmp547 = ($shr546|0)==(0);
 if ($cmp547) {
  $I545$0 = 0;
 } else {
  $cmp551 = ($psize$addr$2>>>0)>(16777215);
  if ($cmp551) {
   $I545$0 = 31;
  } else {
   $sub = (($shr546) + 1048320)|0;
   $shr555 = $sub >>> 16;
   $and556 = $shr555 & 8;
   $shl557 = $shr546 << $and556;
   $sub558 = (($shl557) + 520192)|0;
   $shr559 = $sub558 >>> 16;
   $and560 = $shr559 & 4;
   $add561 = $and560 | $and556;
   $shl562 = $shl557 << $and560;
   $sub563 = (($shl562) + 245760)|0;
   $shr564 = $sub563 >>> 16;
   $and565 = $shr564 & 2;
   $add566 = $add561 | $and565;
   $sub567 = (14 - ($add566))|0;
   $shl568 = $shl562 << $and565;
   $shr569 = $shl568 >>> 15;
   $add570 = (($sub567) + ($shr569))|0;
   $shl571 = $add570 << 1;
   $add572 = (($add570) + 7)|0;
   $shr573 = $psize$addr$2 >>> $add572;
   $and574 = $shr573 & 1;
   $add575 = $and574 | $shl571;
   $I545$0 = $add575;
  }
 }
 $arrayidx579 = (4032 + ($I545$0<<2)|0);
 $index580 = ((($p$addr$1)) + 28|0);
 HEAP32[$index580>>2] = $I545$0;
 $child581 = ((($p$addr$1)) + 16|0);
 $arrayidx582 = ((($p$addr$1)) + 20|0);
 HEAP32[$arrayidx582>>2] = 0;
 HEAP32[$child581>>2] = 0;
 $62 = HEAP32[(3732)>>2]|0;
 $shl586 = 1 << $I545$0;
 $and587 = $62 & $shl586;
 $tobool588 = ($and587|0)==(0);
 if ($tobool588) {
  $or592 = $62 | $shl586;
  HEAP32[(3732)>>2] = $or592;
  HEAP32[$arrayidx579>>2] = $p$addr$1;
  $parent593 = ((($p$addr$1)) + 24|0);
  HEAP32[$parent593>>2] = $arrayidx579;
  $bk594 = ((($p$addr$1)) + 12|0);
  HEAP32[$bk594>>2] = $p$addr$1;
  $fd595 = ((($p$addr$1)) + 8|0);
  HEAP32[$fd595>>2] = $p$addr$1;
  return;
 }
 $63 = HEAP32[$arrayidx579>>2]|0;
 $cmp598 = ($I545$0|0)==(31);
 $shr600 = $I545$0 >>> 1;
 $sub603 = (25 - ($shr600))|0;
 $cond = $cmp598 ? 0 : $sub603;
 $shl604 = $psize$addr$2 << $cond;
 $K597$0 = $shl604;$T$0 = $63;
 while(1) {
  $head605 = ((($T$0)) + 4|0);
  $64 = HEAP32[$head605>>2]|0;
  $and606 = $64 & -8;
  $cmp607 = ($and606|0)==($psize$addr$2|0);
  if ($cmp607) {
   label = 121;
   break;
  }
  $shr611 = $K597$0 >>> 31;
  $arrayidx613 = (((($T$0)) + 16|0) + ($shr611<<2)|0);
  $shl614 = $K597$0 << 1;
  $65 = HEAP32[$arrayidx613>>2]|0;
  $cmp615 = ($65|0)==(0|0);
  if ($cmp615) {
   label = 118;
   break;
  } else {
   $K597$0 = $shl614;$T$0 = $65;
  }
 }
 if ((label|0) == 118) {
  $66 = HEAP32[(3744)>>2]|0;
  $cmp620 = ($arrayidx613>>>0)<($66>>>0);
  if ($cmp620) {
   _abort();
   // unreachable;
  }
  HEAP32[$arrayidx613>>2] = $p$addr$1;
  $parent625 = ((($p$addr$1)) + 24|0);
  HEAP32[$parent625>>2] = $T$0;
  $bk626 = ((($p$addr$1)) + 12|0);
  HEAP32[$bk626>>2] = $p$addr$1;
  $fd627 = ((($p$addr$1)) + 8|0);
  HEAP32[$fd627>>2] = $p$addr$1;
  return;
 }
 else if ((label|0) == 121) {
  $fd635 = ((($T$0)) + 8|0);
  $67 = HEAP32[$fd635>>2]|0;
  $68 = HEAP32[(3744)>>2]|0;
  $cmp641 = ($67>>>0)>=($68>>>0);
  $not$cmp637 = ($T$0>>>0)>=($68>>>0);
  $69 = $cmp641 & $not$cmp637;
  if (!($69)) {
   _abort();
   // unreachable;
  }
  $bk648 = ((($67)) + 12|0);
  HEAP32[$bk648>>2] = $p$addr$1;
  HEAP32[$fd635>>2] = $p$addr$1;
  $fd650 = ((($p$addr$1)) + 8|0);
  HEAP32[$fd650>>2] = $67;
  $bk651 = ((($p$addr$1)) + 12|0);
  HEAP32[$bk651>>2] = $T$0;
  $parent652 = ((($p$addr$1)) + 24|0);
  HEAP32[$parent652>>2] = 0;
  return;
 }
}
function ___stdio_close($f) {
 $f = $f|0;
 var $0 = 0, $call = 0, $call1 = 0, $call2 = 0, $fd = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $fd = ((($f)) + 60|0);
 $0 = HEAP32[$fd>>2]|0;
 $call = (_dummy_54($0)|0);
 HEAP32[$vararg_buffer>>2] = $call;
 $call1 = (___syscall6(6,($vararg_buffer|0))|0);
 $call2 = (___syscall_ret($call1)|0);
 STACKTOP = sp;return ($call2|0);
}
function ___stdio_read($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $add$ptr = 0, $and = 0, $arrayidx21 = 0, $arrayinit$element = 0, $buf3 = 0, $buf_size = 0, $call = 0, $call6 = 0, $cmp = 0, $cmp8 = 0, $fd = 0;
 var $incdec$ptr = 0, $iov = 0, $iov_len = 0, $iov_len4 = 0, $lnot$ext = 0, $or = 0, $rend = 0, $retval$0 = 0, $rpos = 0, $sub = 0, $sub13 = 0, $sub20 = 0, $tobool = 0, $tobool17 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $xor = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $iov = sp + 16|0;
 HEAP32[$iov>>2] = $buf;
 $iov_len = ((($iov)) + 4|0);
 $buf_size = ((($f)) + 48|0);
 $0 = HEAP32[$buf_size>>2]|0;
 $tobool = ($0|0)!=(0);
 $lnot$ext = $tobool&1;
 $sub = (($len) - ($lnot$ext))|0;
 HEAP32[$iov_len>>2] = $sub;
 $arrayinit$element = ((($iov)) + 8|0);
 $buf3 = ((($f)) + 44|0);
 $1 = HEAP32[$buf3>>2]|0;
 HEAP32[$arrayinit$element>>2] = $1;
 $iov_len4 = ((($iov)) + 12|0);
 HEAP32[$iov_len4>>2] = $0;
 $fd = ((($f)) + 60|0);
 $2 = HEAP32[$fd>>2]|0;
 $3 = $iov;
 HEAP32[$vararg_buffer>>2] = $2;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $3;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $call = (___syscall145(145,($vararg_buffer|0))|0);
 $call6 = (___syscall_ret($call)|0);
 $cmp = ($call6|0)<(1);
 if ($cmp) {
  $and = $call6 & 48;
  $xor = $and ^ 16;
  $4 = HEAP32[$f>>2]|0;
  $or = $4 | $xor;
  HEAP32[$f>>2] = $or;
  $retval$0 = $call6;
 } else {
  $5 = HEAP32[$iov_len>>2]|0;
  $cmp8 = ($call6>>>0)>($5>>>0);
  if ($cmp8) {
   $sub13 = (($call6) - ($5))|0;
   $6 = HEAP32[$buf3>>2]|0;
   $rpos = ((($f)) + 4|0);
   HEAP32[$rpos>>2] = $6;
   $add$ptr = (($6) + ($sub13)|0);
   $rend = ((($f)) + 8|0);
   HEAP32[$rend>>2] = $add$ptr;
   $7 = HEAP32[$buf_size>>2]|0;
   $tobool17 = ($7|0)==(0);
   if ($tobool17) {
    $retval$0 = $len;
   } else {
    $incdec$ptr = ((($6)) + 1|0);
    HEAP32[$rpos>>2] = $incdec$ptr;
    $8 = HEAP8[$6>>0]|0;
    $sub20 = (($len) + -1)|0;
    $arrayidx21 = (($buf) + ($sub20)|0);
    HEAP8[$arrayidx21>>0] = $8;
    $retval$0 = $len;
   }
  } else {
   $retval$0 = $call6;
  }
 }
 STACKTOP = sp;return ($retval$0|0);
}
function ___stdio_seek($f,$off,$whence) {
 $f = $f|0;
 $off = $off|0;
 $whence = $whence|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $call = 0, $call1 = 0, $cmp = 0, $fd = 0, $ret = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $ret = sp + 20|0;
 $fd = ((($f)) + 60|0);
 $0 = HEAP32[$fd>>2]|0;
 $1 = $ret;
 HEAP32[$vararg_buffer>>2] = $0;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $off;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $1;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $whence;
 $call = (___syscall140(140,($vararg_buffer|0))|0);
 $call1 = (___syscall_ret($call)|0);
 $cmp = ($call1|0)<(0);
 if ($cmp) {
  HEAP32[$ret>>2] = -1;
  $2 = -1;
 } else {
  $$pre = HEAP32[$ret>>2]|0;
  $2 = $$pre;
 }
 STACKTOP = sp;return ($2|0);
}
function ___syscall_ret($r) {
 $r = $r|0;
 var $call = 0, $cmp = 0, $retval$0 = 0, $sub = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($r>>>0)>(4294963200);
 if ($cmp) {
  $sub = (0 - ($r))|0;
  $call = (___errno_location()|0);
  HEAP32[$call>>2] = $sub;
  $retval$0 = -1;
 } else {
  $retval$0 = $r;
 }
 return ($retval$0|0);
}
function ___errno_location() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (4224|0);
}
function _dummy_54($fd) {
 $fd = $fd|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($fd|0);
}
function ___stdio_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add$ptr = 0, $add$ptr32 = 0, $buf8 = 0, $buf_size = 0, $call = 0, $call40 = 0;
 var $call7 = 0, $call741 = 0, $call746 = 0, $cmp = 0, $cmp12 = 0, $cmp17 = 0, $cmp24 = 0, $cmp42 = 0, $cnt$0 = 0, $dec = 0, $fd = 0, $incdec$ptr = 0, $iov$043 = 0, $iov$1 = 0, $iov_base2 = 0, $iov_len = 0, $iov_len19 = 0, $iov_len23 = 0, $iov_len3 = 0, $iov_len36 = 0;
 var $iovcnt$045 = 0, $iovcnt$1 = 0, $iovs = 0, $or = 0, $rem$044 = 0, $retval$0 = 0, $sub = 0, $sub$ptr$sub = 0, $sub21 = 0, $sub28 = 0, $sub37 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, $wbase = 0, $wend = 0, $wend14 = 0;
 var $wpos = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $iovs = sp + 32|0;
 $wbase = ((($f)) + 28|0);
 $0 = HEAP32[$wbase>>2]|0;
 HEAP32[$iovs>>2] = $0;
 $iov_len = ((($iovs)) + 4|0);
 $wpos = ((($f)) + 20|0);
 $1 = HEAP32[$wpos>>2]|0;
 $sub$ptr$sub = (($1) - ($0))|0;
 HEAP32[$iov_len>>2] = $sub$ptr$sub;
 $iov_base2 = ((($iovs)) + 8|0);
 HEAP32[$iov_base2>>2] = $buf;
 $iov_len3 = ((($iovs)) + 12|0);
 HEAP32[$iov_len3>>2] = $len;
 $add = (($sub$ptr$sub) + ($len))|0;
 $fd = ((($f)) + 60|0);
 $2 = HEAP32[$fd>>2]|0;
 $3 = $iovs;
 HEAP32[$vararg_buffer>>2] = $2;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $3;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $call40 = (___syscall146(146,($vararg_buffer|0))|0);
 $call741 = (___syscall_ret($call40)|0);
 $cmp42 = ($add|0)==($call741|0);
 L1: do {
  if ($cmp42) {
   label = 3;
  } else {
   $call746 = $call741;$iov$043 = $iovs;$iovcnt$045 = 2;$rem$044 = $add;
   while(1) {
    $cmp12 = ($call746|0)<(0);
    if ($cmp12) {
     break;
    }
    $sub21 = (($rem$044) - ($call746))|0;
    $iov_len23 = ((($iov$043)) + 4|0);
    $8 = HEAP32[$iov_len23>>2]|0;
    $cmp24 = ($call746>>>0)>($8>>>0);
    $incdec$ptr = ((($iov$043)) + 8|0);
    $iov$1 = $cmp24 ? $incdec$ptr : $iov$043;
    $dec = $cmp24 << 31 >> 31;
    $iovcnt$1 = (($dec) + ($iovcnt$045))|0;
    $sub28 = $cmp24 ? $8 : 0;
    $cnt$0 = (($call746) - ($sub28))|0;
    $9 = HEAP32[$iov$1>>2]|0;
    $add$ptr32 = (($9) + ($cnt$0)|0);
    HEAP32[$iov$1>>2] = $add$ptr32;
    $iov_len36 = ((($iov$1)) + 4|0);
    $10 = HEAP32[$iov_len36>>2]|0;
    $sub37 = (($10) - ($cnt$0))|0;
    HEAP32[$iov_len36>>2] = $sub37;
    $11 = HEAP32[$fd>>2]|0;
    $12 = $iov$1;
    HEAP32[$vararg_buffer3>>2] = $11;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $12;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $iovcnt$1;
    $call = (___syscall146(146,($vararg_buffer3|0))|0);
    $call7 = (___syscall_ret($call)|0);
    $cmp = ($sub21|0)==($call7|0);
    if ($cmp) {
     label = 3;
     break L1;
    } else {
     $call746 = $call7;$iov$043 = $iov$1;$iovcnt$045 = $iovcnt$1;$rem$044 = $sub21;
    }
   }
   $wend14 = ((($f)) + 16|0);
   HEAP32[$wend14>>2] = 0;
   HEAP32[$wbase>>2] = 0;
   HEAP32[$wpos>>2] = 0;
   $6 = HEAP32[$f>>2]|0;
   $or = $6 | 32;
   HEAP32[$f>>2] = $or;
   $cmp17 = ($iovcnt$045|0)==(2);
   if ($cmp17) {
    $retval$0 = 0;
   } else {
    $iov_len19 = ((($iov$043)) + 4|0);
    $7 = HEAP32[$iov_len19>>2]|0;
    $sub = (($len) - ($7))|0;
    $retval$0 = $sub;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $buf8 = ((($f)) + 44|0);
  $4 = HEAP32[$buf8>>2]|0;
  $buf_size = ((($f)) + 48|0);
  $5 = HEAP32[$buf_size>>2]|0;
  $add$ptr = (($4) + ($5)|0);
  $wend = ((($f)) + 16|0);
  HEAP32[$wend>>2] = $add$ptr;
  HEAP32[$wbase>>2] = $4;
  HEAP32[$wpos>>2] = $4;
  $retval$0 = $len;
 }
 STACKTOP = sp;return ($retval$0|0);
}
function ___stdout_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $and = 0, $call = 0, $call3 = 0, $fd = 0, $lbf = 0, $tobool = 0, $tobool2 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $write = 0, $wsz = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $wsz = sp + 16|0;
 $write = ((($f)) + 36|0);
 HEAP32[$write>>2] = 4;
 $0 = HEAP32[$f>>2]|0;
 $and = $0 & 64;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $fd = ((($f)) + 60|0);
  $1 = HEAP32[$fd>>2]|0;
  $2 = $wsz;
  HEAP32[$vararg_buffer>>2] = $1;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $2;
  $call = (___syscall54(54,($vararg_buffer|0))|0);
  $tobool2 = ($call|0)==(0);
  if (!($tobool2)) {
   $lbf = ((($f)) + 75|0);
   HEAP8[$lbf>>0] = -1;
  }
 }
 $call3 = (___stdio_write($f,$buf,$len)|0);
 STACKTOP = sp;return ($call3|0);
}
function _fprintf($f,$fmt,$varargs) {
 $f = $f|0;
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $ap = 0, $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 $call = (_vfprintf($f,$fmt,$ap)|0);
 STACKTOP = sp;return ($call|0);
}
function _vfprintf($f,$fmt,$ap) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $$call21 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $add$ptr = 0, $and = 0, $and11 = 0, $and36 = 0, $ap2 = 0, $buf = 0, $buf_size = 0, $call = 0, $call21 = 0, $call2130 = 0, $call6 = 0;
 var $cmp = 0, $cmp5 = 0, $cmp7 = 0, $cond = 0, $internal_buf = 0, $lock = 0, $mode = 0, $nl_arg = 0, $nl_type = 0, $or = 0, $ret$1 = 0, $ret$1$ = 0, $retval$0 = 0, $tobool = 0, $tobool22 = 0, $tobool26 = 0, $tobool37 = 0, $tobool41 = 0, $vacopy_currentptr = 0, $wbase = 0;
 var $wend = 0, $wpos = 0, $write = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $ap2 = sp + 120|0;
 $nl_type = sp + 80|0;
 $nl_arg = sp;
 $internal_buf = sp + 136|0;
 dest=$nl_type; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$ap>>2]|0;
 HEAP32[$ap2>>2] = $vacopy_currentptr;
 $call = (_printf_core(0,$fmt,$ap2,$nl_arg,$nl_type)|0);
 $cmp = ($call|0)<(0);
 if ($cmp) {
  $retval$0 = -1;
 } else {
  $lock = ((($f)) + 76|0);
  $0 = HEAP32[$lock>>2]|0;
  $cmp5 = ($0|0)>(-1);
  if ($cmp5) {
   $call6 = (___lockfile($f)|0);
   $cond = $call6;
  } else {
   $cond = 0;
  }
  $1 = HEAP32[$f>>2]|0;
  $and = $1 & 32;
  $mode = ((($f)) + 74|0);
  $2 = HEAP8[$mode>>0]|0;
  $cmp7 = ($2<<24>>24)<(1);
  if ($cmp7) {
   $and11 = $1 & -33;
   HEAP32[$f>>2] = $and11;
  }
  $buf_size = ((($f)) + 48|0);
  $3 = HEAP32[$buf_size>>2]|0;
  $tobool = ($3|0)==(0);
  if ($tobool) {
   $buf = ((($f)) + 44|0);
   $4 = HEAP32[$buf>>2]|0;
   HEAP32[$buf>>2] = $internal_buf;
   $wbase = ((($f)) + 28|0);
   HEAP32[$wbase>>2] = $internal_buf;
   $wpos = ((($f)) + 20|0);
   HEAP32[$wpos>>2] = $internal_buf;
   HEAP32[$buf_size>>2] = 80;
   $add$ptr = ((($internal_buf)) + 80|0);
   $wend = ((($f)) + 16|0);
   HEAP32[$wend>>2] = $add$ptr;
   $call21 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $tobool22 = ($4|0)==(0|0);
   if ($tobool22) {
    $ret$1 = $call21;
   } else {
    $write = ((($f)) + 36|0);
    $5 = HEAP32[$write>>2]|0;
    (FUNCTION_TABLE_iiii[$5 & 7]($f,0,0)|0);
    $6 = HEAP32[$wpos>>2]|0;
    $tobool26 = ($6|0)==(0|0);
    $$call21 = $tobool26 ? -1 : $call21;
    HEAP32[$buf>>2] = $4;
    HEAP32[$buf_size>>2] = 0;
    HEAP32[$wend>>2] = 0;
    HEAP32[$wbase>>2] = 0;
    HEAP32[$wpos>>2] = 0;
    $ret$1 = $$call21;
   }
  } else {
   $call2130 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $ret$1 = $call2130;
  }
  $7 = HEAP32[$f>>2]|0;
  $and36 = $7 & 32;
  $tobool37 = ($and36|0)==(0);
  $ret$1$ = $tobool37 ? $ret$1 : -1;
  $or = $7 | $and;
  HEAP32[$f>>2] = $or;
  $tobool41 = ($cond|0)==(0);
  if (!($tobool41)) {
   ___unlockfile($f);
  }
  $retval$0 = $ret$1$;
 }
 STACKTOP = sp;return ($retval$0|0);
}
function _printf_core($f,$fmt,$ap,$nl_arg,$nl_type) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 $nl_arg = $nl_arg|0;
 $nl_type = $nl_type|0;
 var $$ = 0, $$$ = 0, $$194$ = 0, $$197 = 0, $$add$ptr258 = 0, $$l10n$0 = 0, $$lcssa199 = 0, $$pre = 0, $$pre247 = 0, $$pre248 = 0, $$pre248$pre = 0, $$pre249 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0;
 var $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0;
 var $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0.0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $a$0 = 0, $a$0$add$ptr206 = 0, $a$1 = 0, $a$2 = 0, $add = 0, $add$ptr = 0, $add$ptr139 = 0, $add$ptr206 = 0, $add$ptr258 = 0, $add$ptr341 = 0, $add$ptr360 = 0, $add$ptr43 = 0, $add$ptr43$arrayidx31 = 0, $add$ptr474 = 0, $add$ptr88 = 0, $add270 = 0, $add323 = 0;
 var $add396 = 0, $add413 = 0, $add442 = 0, $and = 0, $and211 = 0, $and215 = 0, $and217 = 0, $and220 = 0, $and250 = 0, $and255 = 0, $and264 = 0, $and290 = 0, $and295 = 0, $and310 = 0, $and310$fl$4 = 0, $arg = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0;
 var $argpos$0 = 0, $arrayidx114 = 0, $arrayidx119 = 0, $arrayidx124 = 0, $arrayidx132 = 0, $arrayidx16 = 0, $arrayidx174 = 0, $arrayidx193 = 0, $arrayidx31 = 0, $arrayidx35 = 0, $arrayidx371 = 0, $arrayidx470 = 0, $arrayidx482 = 0, $arrayidx68 = 0, $arrayidx73 = 0, $arrayidx81 = 0, $buf = 0, $call = 0, $call104 = 0, $call160 = 0;
 var $call345 = 0, $call346 = 0, $call357 = 0, $call385 = 0, $call412 = 0, $call430 = 0, $cmp = 0, $cmp1 = 0, $cmp105 = 0, $cmp111 = 0, $cmp116 = 0, $cmp126 = 0, $cmp13 = 0, $cmp166 = 0, $cmp177 = 0, $cmp18 = 0, $cmp182 = 0, $cmp185 = 0, $cmp212 = 0, $cmp241 = 0;
 var $cmp271 = 0, $cmp307 = 0, $cmp324 = 0, $cmp37 = 0, $cmp378 = 0, $cmp378227 = 0, $cmp386 = 0, $cmp391 = 0, $cmp398 = 0, $cmp405 = 0, $cmp405237 = 0, $cmp414 = 0, $cmp422 = 0, $cmp435 = 0, $cmp443 = 0, $cmp467 = 0, $cmp479 = 0, $cmp50 = 0, $cmp50217 = 0, $cmp65 = 0;
 var $cmp75 = 0, $cmp97 = 0, $cnt$0 = 0, $cnt$1 = 0, $cond149 = 0, $cond246 = 0, $cond355 = 0, $cond427 = 0, $conv120 = 0, $conv134 = 0, $conv164 = 0, $conv172 = 0, $conv175 = 0, $conv208 = 0, $conv230 = 0, $conv233 = 0, $conv32 = 0, $conv48 = 0, $conv48215 = 0, $conv69 = 0;
 var $conv83 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $fl$0$lcssa = 0, $fl$0219 = 0, $fl$1 = 0, $fl$1$and220 = 0, $fl$3 = 0, $fl$4 = 0, $fl$6 = 0, $i$0$lcssa = 0, $i$0$lcssa256 = 0;
 var $i$0229 = 0, $i$1238 = 0, $i$2210 = 0, $i$3207 = 0, $i137 = 0, $i86 = 0, $inc = 0, $inc489 = 0, $incdec$ptr = 0, $incdec$ptr159 = 0, $incdec$ptr171 = 0, $incdec$ptr23 = 0, $incdec$ptr384 = 0, $incdec$ptr411 = 0, $incdec$ptr62 = 0, $isdigit = 0, $isdigit188 = 0, $isdigit190 = 0, $isdigittmp = 0, $isdigittmp$ = 0;
 var $isdigittmp187 = 0, $isdigittmp189 = 0, $l$0 = 0, $l$1228 = 0, $l$2 = 0, $l10n$0 = 0, $l10n$0$phi = 0, $l10n$1 = 0, $l10n$2 = 0, $l10n$3 = 0, $lnot = 0, $lnot$ext = 0, $lnot484 = 0, $mb = 0, $narrow = 0, $or = 0, $or$cond = 0, $or$cond192 = 0, $or$cond193 = 0, $or$cond195 = 0;
 var $or100 = 0, $or100$fl$0 = 0, $or247 = 0, $p$0 = 0, $p$0$p$0$add270 = 0, $p$1 = 0, $p$2 = 0, $p$2$add323 = 0, $p$2$add323$p$2 = 0, $p$3 = 0, $p$4253 = 0, $p$5 = 0, $pl$0 = 0, $pl$1 = 0, $pl$2 = 0, $prefix$0 = 0, $prefix$1 = 0, $prefix$2 = 0, $retval$0 = 0, $s = 0;
 var $shl = 0, $shr = 0, $st$0 = 0, $storemerge = 0, $storemerge186218 = 0, $storemerge191 = 0, $sub = 0, $sub$ptr$lhs$cast = 0, $sub$ptr$lhs$cast318 = 0, $sub$ptr$lhs$cast362 = 0, $sub$ptr$lhs$cast432 = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$rhs$cast268 = 0, $sub$ptr$rhs$cast319 = 0, $sub$ptr$rhs$cast363 = 0, $sub$ptr$rhs$cast433 = 0, $sub$ptr$sub = 0, $sub$ptr$sub269 = 0, $sub$ptr$sub320 = 0, $sub$ptr$sub364 = 0;
 var $sub$ptr$sub434 = 0, $sub$ptr$sub434$p$5 = 0, $sub101 = 0, $sub101$w$0 = 0, $sub135 = 0, $sub165 = 0, $sub173 = 0, $sub176 = 0, $sub390 = 0, $sub49 = 0, $sub49216 = 0, $sub49220 = 0, $sub84 = 0, $t$0 = 0, $t$1 = 0, $tobool = 0, $tobool141 = 0, $tobool179 = 0, $tobool209 = 0, $tobool218 = 0;
 var $tobool25 = 0, $tobool256 = 0, $tobool265 = 0, $tobool28 = 0, $tobool291 = 0, $tobool296 = 0, $tobool315 = 0, $tobool350 = 0, $tobool358 = 0, $tobool381 = 0, $tobool408 = 0, $tobool460 = 0, $tobool463 = 0, $tobool471 = 0, $tobool55 = 0, $tobool90 = 0, $trunc = 0, $w$0 = 0, $w$1 = 0, $w$2 = 0;
 var $wc = 0, $ws$0230 = 0, $ws$1239 = 0, $xor = 0, $xor450 = 0, $xor458 = 0, $z$0$lcssa = 0, $z$0212 = 0, $z$1 = 0, $z$2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $s = sp + 16|0;
 $arg = sp;
 $buf = sp + 24|0;
 $wc = sp + 8|0;
 $mb = sp + 20|0;
 HEAP32[$s>>2] = $fmt;
 $tobool25 = ($f|0)!=(0|0);
 $add$ptr206 = ((($buf)) + 40|0);
 $sub$ptr$lhs$cast318 = $add$ptr206;
 $add$ptr341 = ((($buf)) + 39|0);
 $arrayidx371 = ((($wc)) + 4|0);
 $1 = $fmt;$cnt$0 = 0;$l$0 = 0;$l10n$0 = 0;
 L1: while(1) {
  $cmp = ($cnt$0|0)>(-1);
  do {
   if ($cmp) {
    $sub = (2147483647 - ($cnt$0))|0;
    $cmp1 = ($l$0|0)>($sub|0);
    if ($cmp1) {
     $call = (___errno_location()|0);
     HEAP32[$call>>2] = 75;
     $cnt$1 = -1;
     break;
    } else {
     $add = (($l$0) + ($cnt$0))|0;
     $cnt$1 = $add;
     break;
    }
   } else {
    $cnt$1 = $cnt$0;
   }
  } while(0);
  $0 = HEAP8[$1>>0]|0;
  $tobool = ($0<<24>>24)==(0);
  if ($tobool) {
   label = 87;
   break;
  } else {
   $2 = $0;$3 = $1;
  }
  L9: while(1) {
   switch ($2<<24>>24) {
   case 37:  {
    $4 = $3;$z$0212 = $3;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $7 = $3;$z$0$lcssa = $3;
    break L9;
    break;
   }
   default: {
   }
   }
   $incdec$ptr = ((($3)) + 1|0);
   HEAP32[$s>>2] = $incdec$ptr;
   $$pre = HEAP8[$incdec$ptr>>0]|0;
   $2 = $$pre;$3 = $incdec$ptr;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $arrayidx16 = ((($4)) + 1|0);
     $5 = HEAP8[$arrayidx16>>0]|0;
     $cmp18 = ($5<<24>>24)==(37);
     if (!($cmp18)) {
      $7 = $4;$z$0$lcssa = $z$0212;
      break L12;
     }
     $incdec$ptr23 = ((($z$0212)) + 1|0);
     $add$ptr = ((($4)) + 2|0);
     HEAP32[$s>>2] = $add$ptr;
     $6 = HEAP8[$add$ptr>>0]|0;
     $cmp13 = ($6<<24>>24)==(37);
     if ($cmp13) {
      $4 = $add$ptr;$z$0212 = $incdec$ptr23;
      label = 9;
     } else {
      $7 = $add$ptr;$z$0$lcssa = $incdec$ptr23;
      break;
     }
    }
   }
  } while(0);
  $sub$ptr$lhs$cast = $z$0$lcssa;
  $sub$ptr$rhs$cast = $1;
  $sub$ptr$sub = (($sub$ptr$lhs$cast) - ($sub$ptr$rhs$cast))|0;
  if ($tobool25) {
   _out($f,$1,$sub$ptr$sub);
  }
  $tobool28 = ($sub$ptr$sub|0)==(0);
  if (!($tobool28)) {
   $l10n$0$phi = $l10n$0;$1 = $7;$cnt$0 = $cnt$1;$l$0 = $sub$ptr$sub;$l10n$0 = $l10n$0$phi;
   continue;
  }
  $arrayidx31 = ((($7)) + 1|0);
  $8 = HEAP8[$arrayidx31>>0]|0;
  $conv32 = $8 << 24 >> 24;
  $isdigittmp = (($conv32) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $arrayidx35 = ((($7)) + 2|0);
   $9 = HEAP8[$arrayidx35>>0]|0;
   $cmp37 = ($9<<24>>24)==(36);
   $add$ptr43 = ((($7)) + 3|0);
   $add$ptr43$arrayidx31 = $cmp37 ? $add$ptr43 : $arrayidx31;
   $$l10n$0 = $cmp37 ? 1 : $l10n$0;
   $isdigittmp$ = $cmp37 ? $isdigittmp : -1;
   $argpos$0 = $isdigittmp$;$l10n$1 = $$l10n$0;$storemerge = $add$ptr43$arrayidx31;
  } else {
   $argpos$0 = -1;$l10n$1 = $l10n$0;$storemerge = $arrayidx31;
  }
  HEAP32[$s>>2] = $storemerge;
  $10 = HEAP8[$storemerge>>0]|0;
  $conv48215 = $10 << 24 >> 24;
  $sub49216 = (($conv48215) + -32)|0;
  $cmp50217 = ($sub49216>>>0)<(32);
  L24: do {
   if ($cmp50217) {
    $149 = $10;$fl$0219 = 0;$storemerge186218 = $storemerge;$sub49220 = $sub49216;
    while(1) {
     $shl = 1 << $sub49220;
     $and = $shl & 75913;
     $tobool55 = ($and|0)==(0);
     if ($tobool55) {
      $$lcssa199 = $149;$12 = $storemerge186218;$fl$0$lcssa = $fl$0219;
      break L24;
     }
     $or = $shl | $fl$0219;
     $incdec$ptr62 = ((($storemerge186218)) + 1|0);
     HEAP32[$s>>2] = $incdec$ptr62;
     $11 = HEAP8[$incdec$ptr62>>0]|0;
     $conv48 = $11 << 24 >> 24;
     $sub49 = (($conv48) + -32)|0;
     $cmp50 = ($sub49>>>0)<(32);
     if ($cmp50) {
      $149 = $11;$fl$0219 = $or;$storemerge186218 = $incdec$ptr62;$sub49220 = $sub49;
     } else {
      $$lcssa199 = $11;$12 = $incdec$ptr62;$fl$0$lcssa = $or;
      break;
     }
    }
   } else {
    $$lcssa199 = $10;$12 = $storemerge;$fl$0$lcssa = 0;
   }
  } while(0);
  $cmp65 = ($$lcssa199<<24>>24)==(42);
  if ($cmp65) {
   $arrayidx68 = ((($12)) + 1|0);
   $13 = HEAP8[$arrayidx68>>0]|0;
   $conv69 = $13 << 24 >> 24;
   $isdigittmp189 = (($conv69) + -48)|0;
   $isdigit190 = ($isdigittmp189>>>0)<(10);
   if ($isdigit190) {
    $arrayidx73 = ((($12)) + 2|0);
    $14 = HEAP8[$arrayidx73>>0]|0;
    $cmp75 = ($14<<24>>24)==(36);
    if ($cmp75) {
     $arrayidx81 = (($nl_type) + ($isdigittmp189<<2)|0);
     HEAP32[$arrayidx81>>2] = 10;
     $15 = HEAP8[$arrayidx68>>0]|0;
     $conv83 = $15 << 24 >> 24;
     $sub84 = (($conv83) + -48)|0;
     $i86 = (($nl_arg) + ($sub84<<3)|0);
     $16 = $i86;
     $17 = $16;
     $18 = HEAP32[$17>>2]|0;
     $19 = (($16) + 4)|0;
     $20 = $19;
     $21 = HEAP32[$20>>2]|0;
     $add$ptr88 = ((($12)) + 3|0);
     $l10n$2 = 1;$storemerge191 = $add$ptr88;$w$0 = $18;
    } else {
     label = 23;
    }
   } else {
    label = 23;
   }
   if ((label|0) == 23) {
    label = 0;
    $tobool90 = ($l10n$1|0)==(0);
    if (!($tobool90)) {
     $retval$0 = -1;
     break;
    }
    if ($tobool25) {
     $arglist_current = HEAP32[$ap>>2]|0;
     $22 = $arglist_current;
     $23 = ((0) + 4|0);
     $expanded4 = $23;
     $expanded = (($expanded4) - 1)|0;
     $24 = (($22) + ($expanded))|0;
     $25 = ((0) + 4|0);
     $expanded8 = $25;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $26 = $24 & $expanded6;
     $27 = $26;
     $28 = HEAP32[$27>>2]|0;
     $arglist_next = ((($27)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     $l10n$2 = 0;$storemerge191 = $arrayidx68;$w$0 = $28;
    } else {
     $l10n$2 = 0;$storemerge191 = $arrayidx68;$w$0 = 0;
    }
   }
   HEAP32[$s>>2] = $storemerge191;
   $cmp97 = ($w$0|0)<(0);
   $or100 = $fl$0$lcssa | 8192;
   $sub101 = (0 - ($w$0))|0;
   $or100$fl$0 = $cmp97 ? $or100 : $fl$0$lcssa;
   $sub101$w$0 = $cmp97 ? $sub101 : $w$0;
   $30 = $storemerge191;$fl$1 = $or100$fl$0;$l10n$3 = $l10n$2;$w$1 = $sub101$w$0;
  } else {
   $call104 = (_getint($s)|0);
   $cmp105 = ($call104|0)<(0);
   if ($cmp105) {
    $retval$0 = -1;
    break;
   }
   $$pre247 = HEAP32[$s>>2]|0;
   $30 = $$pre247;$fl$1 = $fl$0$lcssa;$l10n$3 = $l10n$1;$w$1 = $call104;
  }
  $29 = HEAP8[$30>>0]|0;
  $cmp111 = ($29<<24>>24)==(46);
  do {
   if ($cmp111) {
    $arrayidx114 = ((($30)) + 1|0);
    $31 = HEAP8[$arrayidx114>>0]|0;
    $cmp116 = ($31<<24>>24)==(42);
    if (!($cmp116)) {
     $incdec$ptr159 = ((($30)) + 1|0);
     HEAP32[$s>>2] = $incdec$ptr159;
     $call160 = (_getint($s)|0);
     $$pre248$pre = HEAP32[$s>>2]|0;
     $$pre248 = $$pre248$pre;$p$0 = $call160;
     break;
    }
    $arrayidx119 = ((($30)) + 2|0);
    $32 = HEAP8[$arrayidx119>>0]|0;
    $conv120 = $32 << 24 >> 24;
    $isdigittmp187 = (($conv120) + -48)|0;
    $isdigit188 = ($isdigittmp187>>>0)<(10);
    if ($isdigit188) {
     $arrayidx124 = ((($30)) + 3|0);
     $33 = HEAP8[$arrayidx124>>0]|0;
     $cmp126 = ($33<<24>>24)==(36);
     if ($cmp126) {
      $arrayidx132 = (($nl_type) + ($isdigittmp187<<2)|0);
      HEAP32[$arrayidx132>>2] = 10;
      $34 = HEAP8[$arrayidx119>>0]|0;
      $conv134 = $34 << 24 >> 24;
      $sub135 = (($conv134) + -48)|0;
      $i137 = (($nl_arg) + ($sub135<<3)|0);
      $35 = $i137;
      $36 = $35;
      $37 = HEAP32[$36>>2]|0;
      $38 = (($35) + 4)|0;
      $39 = $38;
      $40 = HEAP32[$39>>2]|0;
      $add$ptr139 = ((($30)) + 4|0);
      HEAP32[$s>>2] = $add$ptr139;
      $$pre248 = $add$ptr139;$p$0 = $37;
      break;
     }
    }
    $tobool141 = ($l10n$3|0)==(0);
    if (!($tobool141)) {
     $retval$0 = -1;
     break L1;
    }
    if ($tobool25) {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $41 = $arglist_current2;
     $42 = ((0) + 4|0);
     $expanded11 = $42;
     $expanded10 = (($expanded11) - 1)|0;
     $43 = (($41) + ($expanded10))|0;
     $44 = ((0) + 4|0);
     $expanded15 = $44;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $45 = $43 & $expanded13;
     $46 = $45;
     $47 = HEAP32[$46>>2]|0;
     $arglist_next3 = ((($46)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $cond149 = $47;
    } else {
     $cond149 = 0;
    }
    HEAP32[$s>>2] = $arrayidx119;
    $$pre248 = $arrayidx119;$p$0 = $cond149;
   } else {
    $$pre248 = $30;$p$0 = -1;
   }
  } while(0);
  $49 = $$pre248;$st$0 = 0;
  while(1) {
   $48 = HEAP8[$49>>0]|0;
   $conv164 = $48 << 24 >> 24;
   $sub165 = (($conv164) + -65)|0;
   $cmp166 = ($sub165>>>0)>(57);
   if ($cmp166) {
    $retval$0 = -1;
    break L1;
   }
   $incdec$ptr171 = ((($49)) + 1|0);
   HEAP32[$s>>2] = $incdec$ptr171;
   $50 = HEAP8[$49>>0]|0;
   $conv172 = $50 << 24 >> 24;
   $sub173 = (($conv172) + -65)|0;
   $arrayidx174 = ((1024 + (($st$0*58)|0)|0) + ($sub173)|0);
   $51 = HEAP8[$arrayidx174>>0]|0;
   $conv175 = $51&255;
   $sub176 = (($conv175) + -1)|0;
   $cmp177 = ($sub176>>>0)<(8);
   if ($cmp177) {
    $49 = $incdec$ptr171;$st$0 = $conv175;
   } else {
    break;
   }
  }
  $tobool179 = ($51<<24>>24)==(0);
  if ($tobool179) {
   $retval$0 = -1;
   break;
  }
  $cmp182 = ($51<<24>>24)==(19);
  $cmp185 = ($argpos$0|0)>(-1);
  do {
   if ($cmp182) {
    if ($cmp185) {
     $retval$0 = -1;
     break L1;
    } else {
     label = 49;
    }
   } else {
    if ($cmp185) {
     $arrayidx193 = (($nl_type) + ($argpos$0<<2)|0);
     HEAP32[$arrayidx193>>2] = $conv175;
     $52 = (($nl_arg) + ($argpos$0<<3)|0);
     $53 = $52;
     $54 = $53;
     $55 = HEAP32[$54>>2]|0;
     $56 = (($53) + 4)|0;
     $57 = $56;
     $58 = HEAP32[$57>>2]|0;
     $59 = $arg;
     $60 = $59;
     HEAP32[$60>>2] = $55;
     $61 = (($59) + 4)|0;
     $62 = $61;
     HEAP32[$62>>2] = $58;
     label = 49;
     break;
    }
    if (!($tobool25)) {
     $retval$0 = 0;
     break L1;
    }
    _pop_arg($arg,$conv175,$ap);
   }
  } while(0);
  if ((label|0) == 49) {
   label = 0;
   if (!($tobool25)) {
    $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
    continue;
   }
  }
  $63 = HEAP8[$49>>0]|0;
  $conv208 = $63 << 24 >> 24;
  $tobool209 = ($st$0|0)!=(0);
  $and211 = $conv208 & 15;
  $cmp212 = ($and211|0)==(3);
  $or$cond192 = $tobool209 & $cmp212;
  $and215 = $conv208 & -33;
  $t$0 = $or$cond192 ? $and215 : $conv208;
  $and217 = $fl$1 & 8192;
  $tobool218 = ($and217|0)==(0);
  $and220 = $fl$1 & -65537;
  $fl$1$and220 = $tobool218 ? $fl$1 : $and220;
  L71: do {
   switch ($t$0|0) {
   case 110:  {
    $trunc = $st$0&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $70 = HEAP32[$arg>>2]|0;
     HEAP32[$70>>2] = $cnt$1;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 1:  {
     $71 = HEAP32[$arg>>2]|0;
     HEAP32[$71>>2] = $cnt$1;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 2:  {
     $72 = ($cnt$1|0)<(0);
     $73 = $72 << 31 >> 31;
     $74 = HEAP32[$arg>>2]|0;
     $75 = $74;
     $76 = $75;
     HEAP32[$76>>2] = $cnt$1;
     $77 = (($75) + 4)|0;
     $78 = $77;
     HEAP32[$78>>2] = $73;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 3:  {
     $conv230 = $cnt$1&65535;
     $79 = HEAP32[$arg>>2]|0;
     HEAP16[$79>>1] = $conv230;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 4:  {
     $conv233 = $cnt$1&255;
     $80 = HEAP32[$arg>>2]|0;
     HEAP8[$80>>0] = $conv233;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 6:  {
     $81 = HEAP32[$arg>>2]|0;
     HEAP32[$81>>2] = $cnt$1;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    case 7:  {
     $82 = ($cnt$1|0)<(0);
     $83 = $82 << 31 >> 31;
     $84 = HEAP32[$arg>>2]|0;
     $85 = $84;
     $86 = $85;
     HEAP32[$86>>2] = $cnt$1;
     $87 = (($85) + 4)|0;
     $88 = $87;
     HEAP32[$88>>2] = $83;
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
     break;
    }
    default: {
     $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = 0;$l10n$0 = $l10n$3;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $cmp241 = ($p$0>>>0)>(8);
    $cond246 = $cmp241 ? $p$0 : 8;
    $or247 = $fl$1$and220 | 8;
    $fl$3 = $or247;$p$1 = $cond246;$t$1 = 120;
    label = 61;
    break;
   }
   case 88: case 120:  {
    $fl$3 = $fl$1$and220;$p$1 = $p$0;$t$1 = $t$0;
    label = 61;
    break;
   }
   case 111:  {
    $99 = $arg;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    $102 = (($99) + 4)|0;
    $103 = $102;
    $104 = HEAP32[$103>>2]|0;
    $105 = (_fmt_o($101,$104,$add$ptr206)|0);
    $and264 = $fl$1$and220 & 8;
    $tobool265 = ($and264|0)==(0);
    $sub$ptr$rhs$cast268 = $105;
    $sub$ptr$sub269 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast268))|0;
    $cmp271 = ($p$0|0)>($sub$ptr$sub269|0);
    $add270 = (($sub$ptr$sub269) + 1)|0;
    $106 = $tobool265 | $cmp271;
    $p$0$p$0$add270 = $106 ? $p$0 : $add270;
    $124 = $101;$126 = $104;$a$0 = $105;$fl$4 = $fl$1$and220;$p$2 = $p$0$p$0$add270;$pl$1 = 0;$prefix$1 = 1488;
    label = 67;
    break;
   }
   case 105: case 100:  {
    $107 = $arg;
    $108 = $107;
    $109 = HEAP32[$108>>2]|0;
    $110 = (($107) + 4)|0;
    $111 = $110;
    $112 = HEAP32[$111>>2]|0;
    $113 = ($112|0)<(0);
    if ($113) {
     $114 = (_i64Subtract(0,0,($109|0),($112|0))|0);
     $115 = tempRet0;
     $116 = $arg;
     $117 = $116;
     HEAP32[$117>>2] = $114;
     $118 = (($116) + 4)|0;
     $119 = $118;
     HEAP32[$119>>2] = $115;
     $121 = $114;$122 = $115;$pl$0 = 1;$prefix$0 = 1488;
     label = 66;
     break L71;
    } else {
     $and290 = $fl$1$and220 & 2048;
     $tobool291 = ($and290|0)==(0);
     $and295 = $fl$1$and220 & 1;
     $tobool296 = ($and295|0)==(0);
     $$ = $tobool296 ? 1488 : (1490);
     $$$ = $tobool291 ? $$ : (1489);
     $120 = $fl$1$and220 & 2049;
     $narrow = ($120|0)!=(0);
     $$194$ = $narrow&1;
     $121 = $109;$122 = $112;$pl$0 = $$194$;$prefix$0 = $$$;
     label = 66;
     break L71;
    }
    break;
   }
   case 117:  {
    $64 = $arg;
    $65 = $64;
    $66 = HEAP32[$65>>2]|0;
    $67 = (($64) + 4)|0;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $121 = $66;$122 = $69;$pl$0 = 0;$prefix$0 = 1488;
    label = 66;
    break;
   }
   case 99:  {
    $129 = $arg;
    $130 = $129;
    $131 = HEAP32[$130>>2]|0;
    $132 = (($129) + 4)|0;
    $133 = $132;
    $134 = HEAP32[$133>>2]|0;
    $135 = $131&255;
    HEAP8[$add$ptr341>>0] = $135;
    $a$2 = $add$ptr341;$fl$6 = $and220;$p$5 = 1;$pl$2 = 0;$prefix$2 = 1488;$z$2 = $add$ptr206;
    break;
   }
   case 109:  {
    $call345 = (___errno_location()|0);
    $136 = HEAP32[$call345>>2]|0;
    $call346 = (_strerror($136)|0);
    $a$1 = $call346;
    label = 71;
    break;
   }
   case 115:  {
    $137 = HEAP32[$arg>>2]|0;
    $tobool350 = ($137|0)!=(0|0);
    $cond355 = $tobool350 ? $137 : 1498;
    $a$1 = $cond355;
    label = 71;
    break;
   }
   case 67:  {
    $138 = $arg;
    $139 = $138;
    $140 = HEAP32[$139>>2]|0;
    $141 = (($138) + 4)|0;
    $142 = $141;
    $143 = HEAP32[$142>>2]|0;
    HEAP32[$wc>>2] = $140;
    HEAP32[$arrayidx371>>2] = 0;
    HEAP32[$arg>>2] = $wc;
    $150 = $wc;$p$4253 = -1;
    label = 75;
    break;
   }
   case 83:  {
    $$pre249 = HEAP32[$arg>>2]|0;
    $cmp378227 = ($p$0|0)==(0);
    if ($cmp378227) {
     _pad($f,32,$w$1,0,$fl$1$and220);
     $i$0$lcssa256 = 0;
     label = 84;
    } else {
     $150 = $$pre249;$p$4253 = $p$0;
     label = 75;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $146 = +HEAPF64[$arg>>3];
    $call430 = (_fmt_fp($f,$146,$w$1,$p$0,$fl$1$and220,$t$0)|0);
    $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = $call430;$l10n$0 = $l10n$3;
    continue L1;
    break;
   }
   default: {
    $a$2 = $1;$fl$6 = $fl$1$and220;$p$5 = $p$0;$pl$2 = 0;$prefix$2 = 1488;$z$2 = $add$ptr206;
   }
   }
  } while(0);
  L95: do {
   if ((label|0) == 61) {
    label = 0;
    $89 = $arg;
    $90 = $89;
    $91 = HEAP32[$90>>2]|0;
    $92 = (($89) + 4)|0;
    $93 = $92;
    $94 = HEAP32[$93>>2]|0;
    $and250 = $t$1 & 32;
    $95 = (_fmt_x($91,$94,$add$ptr206,$and250)|0);
    $96 = ($91|0)==(0);
    $97 = ($94|0)==(0);
    $98 = $96 & $97;
    $and255 = $fl$3 & 8;
    $tobool256 = ($and255|0)==(0);
    $or$cond193 = $tobool256 | $98;
    $shr = $t$1 >> 4;
    $add$ptr258 = (1488 + ($shr)|0);
    $$add$ptr258 = $or$cond193 ? 1488 : $add$ptr258;
    $$197 = $or$cond193 ? 0 : 2;
    $124 = $91;$126 = $94;$a$0 = $95;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = $$197;$prefix$1 = $$add$ptr258;
    label = 67;
   }
   else if ((label|0) == 66) {
    label = 0;
    $123 = (_fmt_u($121,$122,$add$ptr206)|0);
    $124 = $121;$126 = $122;$a$0 = $123;$fl$4 = $fl$1$and220;$p$2 = $p$0;$pl$1 = $pl$0;$prefix$1 = $prefix$0;
    label = 67;
   }
   else if ((label|0) == 71) {
    label = 0;
    $call357 = (_memchr($a$1,0,$p$0)|0);
    $tobool358 = ($call357|0)==(0|0);
    $sub$ptr$lhs$cast362 = $call357;
    $sub$ptr$rhs$cast363 = $a$1;
    $sub$ptr$sub364 = (($sub$ptr$lhs$cast362) - ($sub$ptr$rhs$cast363))|0;
    $add$ptr360 = (($a$1) + ($p$0)|0);
    $p$3 = $tobool358 ? $p$0 : $sub$ptr$sub364;
    $z$1 = $tobool358 ? $add$ptr360 : $call357;
    $a$2 = $a$1;$fl$6 = $and220;$p$5 = $p$3;$pl$2 = 0;$prefix$2 = 1488;$z$2 = $z$1;
   }
   else if ((label|0) == 75) {
    label = 0;
    $i$0229 = 0;$l$1228 = 0;$ws$0230 = $150;
    while(1) {
     $144 = HEAP32[$ws$0230>>2]|0;
     $tobool381 = ($144|0)==(0);
     if ($tobool381) {
      $i$0$lcssa = $i$0229;$l$2 = $l$1228;
      break;
     }
     $call385 = (_wctomb($mb,$144)|0);
     $cmp386 = ($call385|0)<(0);
     $sub390 = (($p$4253) - ($i$0229))|0;
     $cmp391 = ($call385>>>0)>($sub390>>>0);
     $or$cond195 = $cmp386 | $cmp391;
     if ($or$cond195) {
      $i$0$lcssa = $i$0229;$l$2 = $call385;
      break;
     }
     $incdec$ptr384 = ((($ws$0230)) + 4|0);
     $add396 = (($call385) + ($i$0229))|0;
     $cmp378 = ($p$4253>>>0)>($add396>>>0);
     if ($cmp378) {
      $i$0229 = $add396;$l$1228 = $call385;$ws$0230 = $incdec$ptr384;
     } else {
      $i$0$lcssa = $add396;$l$2 = $call385;
      break;
     }
    }
    $cmp398 = ($l$2|0)<(0);
    if ($cmp398) {
     $retval$0 = -1;
     break L1;
    }
    _pad($f,32,$w$1,$i$0$lcssa,$fl$1$and220);
    $cmp405237 = ($i$0$lcssa|0)==(0);
    if ($cmp405237) {
     $i$0$lcssa256 = 0;
     label = 84;
    } else {
     $i$1238 = 0;$ws$1239 = $150;
     while(1) {
      $145 = HEAP32[$ws$1239>>2]|0;
      $tobool408 = ($145|0)==(0);
      if ($tobool408) {
       $i$0$lcssa256 = $i$0$lcssa;
       label = 84;
       break L95;
      }
      $call412 = (_wctomb($mb,$145)|0);
      $add413 = (($call412) + ($i$1238))|0;
      $cmp414 = ($add413|0)>($i$0$lcssa|0);
      if ($cmp414) {
       $i$0$lcssa256 = $i$0$lcssa;
       label = 84;
       break L95;
      }
      $incdec$ptr411 = ((($ws$1239)) + 4|0);
      _out($f,$mb,$call412);
      $cmp405 = ($add413>>>0)<($i$0$lcssa>>>0);
      if ($cmp405) {
       $i$1238 = $add413;$ws$1239 = $incdec$ptr411;
      } else {
       $i$0$lcssa256 = $i$0$lcssa;
       label = 84;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 67) {
   label = 0;
   $cmp307 = ($p$2|0)>(-1);
   $and310 = $fl$4 & -65537;
   $and310$fl$4 = $cmp307 ? $and310 : $fl$4;
   $125 = ($124|0)!=(0);
   $127 = ($126|0)!=(0);
   $128 = $125 | $127;
   $tobool315 = ($p$2|0)!=(0);
   $or$cond = $tobool315 | $128;
   $sub$ptr$rhs$cast319 = $a$0;
   $sub$ptr$sub320 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast319))|0;
   $lnot = $128 ^ 1;
   $lnot$ext = $lnot&1;
   $add323 = (($lnot$ext) + ($sub$ptr$sub320))|0;
   $cmp324 = ($p$2|0)>($add323|0);
   $p$2$add323 = $cmp324 ? $p$2 : $add323;
   $p$2$add323$p$2 = $or$cond ? $p$2$add323 : $p$2;
   $a$0$add$ptr206 = $or$cond ? $a$0 : $add$ptr206;
   $a$2 = $a$0$add$ptr206;$fl$6 = $and310$fl$4;$p$5 = $p$2$add323$p$2;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $add$ptr206;
  }
  else if ((label|0) == 84) {
   label = 0;
   $xor = $fl$1$and220 ^ 8192;
   _pad($f,32,$w$1,$i$0$lcssa256,$xor);
   $cmp422 = ($w$1|0)>($i$0$lcssa256|0);
   $cond427 = $cmp422 ? $w$1 : $i$0$lcssa256;
   $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = $cond427;$l10n$0 = $l10n$3;
   continue;
  }
  $sub$ptr$lhs$cast432 = $z$2;
  $sub$ptr$rhs$cast433 = $a$2;
  $sub$ptr$sub434 = (($sub$ptr$lhs$cast432) - ($sub$ptr$rhs$cast433))|0;
  $cmp435 = ($p$5|0)<($sub$ptr$sub434|0);
  $sub$ptr$sub434$p$5 = $cmp435 ? $sub$ptr$sub434 : $p$5;
  $add442 = (($sub$ptr$sub434$p$5) + ($pl$2))|0;
  $cmp443 = ($w$1|0)<($add442|0);
  $w$2 = $cmp443 ? $add442 : $w$1;
  _pad($f,32,$w$2,$add442,$fl$6);
  _out($f,$prefix$2,$pl$2);
  $xor450 = $fl$6 ^ 65536;
  _pad($f,48,$w$2,$add442,$xor450);
  _pad($f,48,$sub$ptr$sub434$p$5,$sub$ptr$sub434,0);
  _out($f,$a$2,$sub$ptr$sub434);
  $xor458 = $fl$6 ^ 8192;
  _pad($f,32,$w$2,$add442,$xor458);
  $1 = $incdec$ptr171;$cnt$0 = $cnt$1;$l$0 = $w$2;$l10n$0 = $l10n$3;
 }
 L114: do {
  if ((label|0) == 87) {
   $tobool460 = ($f|0)==(0|0);
   if ($tobool460) {
    $tobool463 = ($l10n$0|0)==(0);
    if ($tobool463) {
     $retval$0 = 0;
    } else {
     $i$2210 = 1;
     while(1) {
      $arrayidx470 = (($nl_type) + ($i$2210<<2)|0);
      $147 = HEAP32[$arrayidx470>>2]|0;
      $tobool471 = ($147|0)==(0);
      if ($tobool471) {
       $i$3207 = $i$2210;
       break;
      }
      $add$ptr474 = (($nl_arg) + ($i$2210<<3)|0);
      _pop_arg($add$ptr474,$147,$ap);
      $inc = (($i$2210) + 1)|0;
      $cmp467 = ($inc|0)<(10);
      if ($cmp467) {
       $i$2210 = $inc;
      } else {
       $retval$0 = 1;
       break L114;
      }
     }
     while(1) {
      $arrayidx482 = (($nl_type) + ($i$3207<<2)|0);
      $148 = HEAP32[$arrayidx482>>2]|0;
      $lnot484 = ($148|0)==(0);
      $inc489 = (($i$3207) + 1)|0;
      if (!($lnot484)) {
       $retval$0 = -1;
       break L114;
      }
      $cmp479 = ($inc489|0)<(10);
      if ($cmp479) {
       $i$3207 = $inc489;
      } else {
       $retval$0 = 1;
       break;
      }
     }
    }
   } else {
    $retval$0 = $cnt$1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($retval$0|0);
}
function ___lockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out($f,$s,$l) {
 $f = $f|0;
 $s = $s|0;
 $l = $l|0;
 var $0 = 0, $and = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$f>>2]|0;
 $and = $0 & 32;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  (___fwritex($s,$l,$f)|0);
 }
 return;
}
function _getint($s) {
 $s = $s|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $add = 0, $conv = 0, $conv4 = 0, $i$0$lcssa = 0, $i$07 = 0, $incdec$ptr = 0, $isdigit = 0, $isdigit6 = 0, $isdigittmp = 0, $isdigittmp5 = 0, $isdigittmp8 = 0, $mul = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$s>>2]|0;
 $1 = HEAP8[$0>>0]|0;
 $conv4 = $1 << 24 >> 24;
 $isdigittmp5 = (($conv4) + -48)|0;
 $isdigit6 = ($isdigittmp5>>>0)<(10);
 if ($isdigit6) {
  $2 = $0;$i$07 = 0;$isdigittmp8 = $isdigittmp5;
  while(1) {
   $mul = ($i$07*10)|0;
   $add = (($isdigittmp8) + ($mul))|0;
   $incdec$ptr = ((($2)) + 1|0);
   HEAP32[$s>>2] = $incdec$ptr;
   $3 = HEAP8[$incdec$ptr>>0]|0;
   $conv = $3 << 24 >> 24;
   $isdigittmp = (($conv) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $2 = $incdec$ptr;$i$07 = $add;$isdigittmp8 = $isdigittmp;
   } else {
    $i$0$lcssa = $add;
    break;
   }
  }
 } else {
  $i$0$lcssa = 0;
 }
 return ($i$0$lcssa|0);
}
function _pop_arg($arg,$type,$ap) {
 $arg = $arg|0;
 $type = $type|0;
 $ap = $ap|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0.0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0;
 var $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0;
 var $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0, $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0;
 var $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $cmp = 0, $conv16 = 0, $conv22$mask = 0, $conv28 = 0, $conv34$mask = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($type>>>0)>(20);
 L1: do {
  if (!($cmp)) {
   do {
    switch ($type|0) {
    case 9:  {
     $arglist_current = HEAP32[$ap>>2]|0;
     $0 = $arglist_current;
     $1 = ((0) + 4|0);
     $expanded28 = $1;
     $expanded = (($expanded28) - 1)|0;
     $2 = (($0) + ($expanded))|0;
     $3 = ((0) + 4|0);
     $expanded32 = $3;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $4 = $2 & $expanded30;
     $5 = $4;
     $6 = HEAP32[$5>>2]|0;
     $arglist_next = ((($5)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     HEAP32[$arg>>2] = $6;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $7 = $arglist_current2;
     $8 = ((0) + 4|0);
     $expanded35 = $8;
     $expanded34 = (($expanded35) - 1)|0;
     $9 = (($7) + ($expanded34))|0;
     $10 = ((0) + 4|0);
     $expanded39 = $10;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $11 = $9 & $expanded37;
     $12 = $11;
     $13 = HEAP32[$12>>2]|0;
     $arglist_next3 = ((($12)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $14 = ($13|0)<(0);
     $15 = $14 << 31 >> 31;
     $16 = $arg;
     $17 = $16;
     HEAP32[$17>>2] = $13;
     $18 = (($16) + 4)|0;
     $19 = $18;
     HEAP32[$19>>2] = $15;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$ap>>2]|0;
     $20 = $arglist_current5;
     $21 = ((0) + 4|0);
     $expanded42 = $21;
     $expanded41 = (($expanded42) - 1)|0;
     $22 = (($20) + ($expanded41))|0;
     $23 = ((0) + 4|0);
     $expanded46 = $23;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $24 = $22 & $expanded44;
     $25 = $24;
     $26 = HEAP32[$25>>2]|0;
     $arglist_next6 = ((($25)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next6;
     $27 = $arg;
     $28 = $27;
     HEAP32[$28>>2] = $26;
     $29 = (($27) + 4)|0;
     $30 = $29;
     HEAP32[$30>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$ap>>2]|0;
     $31 = $arglist_current8;
     $32 = ((0) + 8|0);
     $expanded49 = $32;
     $expanded48 = (($expanded49) - 1)|0;
     $33 = (($31) + ($expanded48))|0;
     $34 = ((0) + 8|0);
     $expanded53 = $34;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $35 = $33 & $expanded51;
     $36 = $35;
     $37 = $36;
     $38 = $37;
     $39 = HEAP32[$38>>2]|0;
     $40 = (($37) + 4)|0;
     $41 = $40;
     $42 = HEAP32[$41>>2]|0;
     $arglist_next9 = ((($36)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next9;
     $43 = $arg;
     $44 = $43;
     HEAP32[$44>>2] = $39;
     $45 = (($43) + 4)|0;
     $46 = $45;
     HEAP32[$46>>2] = $42;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$ap>>2]|0;
     $47 = $arglist_current11;
     $48 = ((0) + 4|0);
     $expanded56 = $48;
     $expanded55 = (($expanded56) - 1)|0;
     $49 = (($47) + ($expanded55))|0;
     $50 = ((0) + 4|0);
     $expanded60 = $50;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $51 = $49 & $expanded58;
     $52 = $51;
     $53 = HEAP32[$52>>2]|0;
     $arglist_next12 = ((($52)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next12;
     $conv16 = $53&65535;
     $54 = $conv16 << 16 >> 16;
     $55 = ($54|0)<(0);
     $56 = $55 << 31 >> 31;
     $57 = $arg;
     $58 = $57;
     HEAP32[$58>>2] = $54;
     $59 = (($57) + 4)|0;
     $60 = $59;
     HEAP32[$60>>2] = $56;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$ap>>2]|0;
     $61 = $arglist_current14;
     $62 = ((0) + 4|0);
     $expanded63 = $62;
     $expanded62 = (($expanded63) - 1)|0;
     $63 = (($61) + ($expanded62))|0;
     $64 = ((0) + 4|0);
     $expanded67 = $64;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $65 = $63 & $expanded65;
     $66 = $65;
     $67 = HEAP32[$66>>2]|0;
     $arglist_next15 = ((($66)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next15;
     $conv22$mask = $67 & 65535;
     $68 = $arg;
     $69 = $68;
     HEAP32[$69>>2] = $conv22$mask;
     $70 = (($68) + 4)|0;
     $71 = $70;
     HEAP32[$71>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$ap>>2]|0;
     $72 = $arglist_current17;
     $73 = ((0) + 4|0);
     $expanded70 = $73;
     $expanded69 = (($expanded70) - 1)|0;
     $74 = (($72) + ($expanded69))|0;
     $75 = ((0) + 4|0);
     $expanded74 = $75;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $76 = $74 & $expanded72;
     $77 = $76;
     $78 = HEAP32[$77>>2]|0;
     $arglist_next18 = ((($77)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next18;
     $conv28 = $78&255;
     $79 = $conv28 << 24 >> 24;
     $80 = ($79|0)<(0);
     $81 = $80 << 31 >> 31;
     $82 = $arg;
     $83 = $82;
     HEAP32[$83>>2] = $79;
     $84 = (($82) + 4)|0;
     $85 = $84;
     HEAP32[$85>>2] = $81;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$ap>>2]|0;
     $86 = $arglist_current20;
     $87 = ((0) + 4|0);
     $expanded77 = $87;
     $expanded76 = (($expanded77) - 1)|0;
     $88 = (($86) + ($expanded76))|0;
     $89 = ((0) + 4|0);
     $expanded81 = $89;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $90 = $88 & $expanded79;
     $91 = $90;
     $92 = HEAP32[$91>>2]|0;
     $arglist_next21 = ((($91)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next21;
     $conv34$mask = $92 & 255;
     $93 = $arg;
     $94 = $93;
     HEAP32[$94>>2] = $conv34$mask;
     $95 = (($93) + 4)|0;
     $96 = $95;
     HEAP32[$96>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$ap>>2]|0;
     $97 = $arglist_current23;
     $98 = ((0) + 8|0);
     $expanded84 = $98;
     $expanded83 = (($expanded84) - 1)|0;
     $99 = (($97) + ($expanded83))|0;
     $100 = ((0) + 8|0);
     $expanded88 = $100;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $101 = $99 & $expanded86;
     $102 = $101;
     $103 = +HEAPF64[$102>>3];
     $arglist_next24 = ((($102)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next24;
     HEAPF64[$arg>>3] = $103;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$ap>>2]|0;
     $104 = $arglist_current26;
     $105 = ((0) + 8|0);
     $expanded91 = $105;
     $expanded90 = (($expanded91) - 1)|0;
     $106 = (($104) + ($expanded90))|0;
     $107 = ((0) + 8|0);
     $expanded95 = $107;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $108 = $106 & $expanded93;
     $109 = $108;
     $110 = +HEAPF64[$109>>3];
     $arglist_next27 = ((($109)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next27;
     HEAPF64[$arg>>3] = $110;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$s,$lower) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 $lower = $lower|0;
 var $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $arrayidx = 0, $conv1 = 0, $conv4 = 0, $idxprom = 0, $incdec$ptr = 0, $or = 0, $s$addr$0$lcssa = 0, $s$addr$06 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0);
 $3 = ($1|0)==(0);
 $4 = $2 & $3;
 if ($4) {
  $s$addr$0$lcssa = $s;
 } else {
  $5 = $0;$7 = $1;$s$addr$06 = $s;
  while(1) {
   $idxprom = $5 & 15;
   $arrayidx = (1536 + ($idxprom)|0);
   $6 = HEAP8[$arrayidx>>0]|0;
   $conv4 = $6&255;
   $or = $conv4 | $lower;
   $conv1 = $or&255;
   $incdec$ptr = ((($s$addr$06)) + -1|0);
   HEAP8[$incdec$ptr>>0] = $conv1;
   $8 = (_bitshift64Lshr(($5|0),($7|0),4)|0);
   $9 = tempRet0;
   $10 = ($8|0)==(0);
   $11 = ($9|0)==(0);
   $12 = $10 & $11;
   if ($12) {
    $s$addr$0$lcssa = $incdec$ptr;
    break;
   } else {
    $5 = $8;$7 = $9;$s$addr$06 = $incdec$ptr;
   }
  }
 }
 return ($s$addr$0$lcssa|0);
}
function _fmt_o($0,$1,$s) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $conv = 0, $incdec$ptr = 0, $s$addr$0$lcssa = 0, $s$addr$06 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0);
 $3 = ($1|0)==(0);
 $4 = $2 & $3;
 if ($4) {
  $s$addr$0$lcssa = $s;
 } else {
  $6 = $0;$8 = $1;$s$addr$06 = $s;
  while(1) {
   $5 = $6&255;
   $7 = $5 & 7;
   $conv = $7 | 48;
   $incdec$ptr = ((($s$addr$06)) + -1|0);
   HEAP8[$incdec$ptr>>0] = $conv;
   $9 = (_bitshift64Lshr(($6|0),($8|0),3)|0);
   $10 = tempRet0;
   $11 = ($9|0)==(0);
   $12 = ($10|0)==(0);
   $13 = $11 & $12;
   if ($13) {
    $s$addr$0$lcssa = $incdec$ptr;
    break;
   } else {
    $6 = $9;$8 = $10;$s$addr$06 = $incdec$ptr;
   }
  }
 }
 return ($s$addr$0$lcssa|0);
}
function _fmt_u($0,$1,$s) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add5 = 0, $conv = 0;
 var $conv6 = 0, $div9 = 0, $incdec$ptr = 0, $incdec$ptr7 = 0, $rem4 = 0, $s$addr$0$lcssa = 0, $s$addr$013 = 0, $s$addr$1$lcssa = 0, $s$addr$19 = 0, $tobool8 = 0, $x$addr$0$lcssa$off0 = 0, $y$010 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1>>>0)>(0);
 $3 = ($0>>>0)>(4294967295);
 $4 = ($1|0)==(0);
 $5 = $4 & $3;
 $6 = $2 | $5;
 if ($6) {
  $7 = $0;$8 = $1;$s$addr$013 = $s;
  while(1) {
   $9 = (___uremdi3(($7|0),($8|0),10,0)|0);
   $10 = tempRet0;
   $11 = $9&255;
   $conv = $11 | 48;
   $incdec$ptr = ((($s$addr$013)) + -1|0);
   HEAP8[$incdec$ptr>>0] = $conv;
   $12 = (___udivdi3(($7|0),($8|0),10,0)|0);
   $13 = tempRet0;
   $14 = ($8>>>0)>(9);
   $15 = ($7>>>0)>(4294967295);
   $16 = ($8|0)==(9);
   $17 = $16 & $15;
   $18 = $14 | $17;
   if ($18) {
    $7 = $12;$8 = $13;$s$addr$013 = $incdec$ptr;
   } else {
    break;
   }
  }
  $s$addr$0$lcssa = $incdec$ptr;$x$addr$0$lcssa$off0 = $12;
 } else {
  $s$addr$0$lcssa = $s;$x$addr$0$lcssa$off0 = $0;
 }
 $tobool8 = ($x$addr$0$lcssa$off0|0)==(0);
 if ($tobool8) {
  $s$addr$1$lcssa = $s$addr$0$lcssa;
 } else {
  $s$addr$19 = $s$addr$0$lcssa;$y$010 = $x$addr$0$lcssa$off0;
  while(1) {
   $rem4 = (($y$010>>>0) % 10)&-1;
   $add5 = $rem4 | 48;
   $conv6 = $add5&255;
   $incdec$ptr7 = ((($s$addr$19)) + -1|0);
   HEAP8[$incdec$ptr7>>0] = $conv6;
   $div9 = (($y$010>>>0) / 10)&-1;
   $19 = ($y$010>>>0)<(10);
   if ($19) {
    $s$addr$1$lcssa = $incdec$ptr7;
    break;
   } else {
    $s$addr$19 = $incdec$ptr7;$y$010 = $div9;
   }
  }
 }
 return ($s$addr$1$lcssa|0);
}
function _strerror($e) {
 $e = $e|0;
 var $0 = 0, $call = 0, $call1 = 0, $locale = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (___pthread_self_654()|0);
 $locale = ((($call)) + 188|0);
 $0 = HEAP32[$locale>>2]|0;
 $call1 = (___strerror_l($e,$0)|0);
 return ($call1|0);
}
function _memchr($src,$c,$n) {
 $src = $src|0;
 $c = $c|0;
 $n = $n|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $and = 0, $and15 = 0, $and16 = 0, $and39 = 0, $cmp = 0, $cmp11 = 0, $cmp1132 = 0, $cmp28 = 0, $cmp8 = 0, $cond = 0, $conv1 = 0, $dec = 0;
 var $dec34 = 0, $incdec$ptr = 0, $incdec$ptr21 = 0, $incdec$ptr33 = 0, $lnot = 0, $mul = 0, $n$addr$0$lcssa = 0, $n$addr$0$lcssa52 = 0, $n$addr$043 = 0, $n$addr$1$lcssa = 0, $n$addr$133 = 0, $n$addr$227 = 0, $n$addr$3 = 0, $neg = 0, $or$cond = 0, $or$cond42 = 0, $s$0$lcssa = 0, $s$0$lcssa53 = 0, $s$044 = 0, $s$128 = 0;
 var $s$2 = 0, $sub = 0, $sub22 = 0, $tobool = 0, $tobool2 = 0, $tobool2$lcssa = 0, $tobool241 = 0, $tobool25 = 0, $tobool2526 = 0, $tobool36 = 0, $tobool40 = 0, $w$0$lcssa = 0, $w$034 = 0, $xor = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $conv1 = $c & 255;
 $0 = $src;
 $and39 = $0 & 3;
 $tobool40 = ($and39|0)!=(0);
 $tobool241 = ($n|0)!=(0);
 $or$cond42 = $tobool241 & $tobool40;
 L1: do {
  if ($or$cond42) {
   $1 = $c&255;
   $n$addr$043 = $n;$s$044 = $src;
   while(1) {
    $2 = HEAP8[$s$044>>0]|0;
    $cmp = ($2<<24>>24)==($1<<24>>24);
    if ($cmp) {
     $n$addr$0$lcssa52 = $n$addr$043;$s$0$lcssa53 = $s$044;
     label = 6;
     break L1;
    }
    $incdec$ptr = ((($s$044)) + 1|0);
    $dec = (($n$addr$043) + -1)|0;
    $3 = $incdec$ptr;
    $and = $3 & 3;
    $tobool = ($and|0)!=(0);
    $tobool2 = ($dec|0)!=(0);
    $or$cond = $tobool2 & $tobool;
    if ($or$cond) {
     $n$addr$043 = $dec;$s$044 = $incdec$ptr;
    } else {
     $n$addr$0$lcssa = $dec;$s$0$lcssa = $incdec$ptr;$tobool2$lcssa = $tobool2;
     label = 5;
     break;
    }
   }
  } else {
   $n$addr$0$lcssa = $n;$s$0$lcssa = $src;$tobool2$lcssa = $tobool241;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($tobool2$lcssa) {
   $n$addr$0$lcssa52 = $n$addr$0$lcssa;$s$0$lcssa53 = $s$0$lcssa;
   label = 6;
  } else {
   $n$addr$3 = 0;$s$2 = $s$0$lcssa;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $4 = HEAP8[$s$0$lcssa53>>0]|0;
   $5 = $c&255;
   $cmp8 = ($4<<24>>24)==($5<<24>>24);
   if ($cmp8) {
    $n$addr$3 = $n$addr$0$lcssa52;$s$2 = $s$0$lcssa53;
   } else {
    $mul = Math_imul($conv1, 16843009)|0;
    $cmp1132 = ($n$addr$0$lcssa52>>>0)>(3);
    L11: do {
     if ($cmp1132) {
      $n$addr$133 = $n$addr$0$lcssa52;$w$034 = $s$0$lcssa53;
      while(1) {
       $6 = HEAP32[$w$034>>2]|0;
       $xor = $6 ^ $mul;
       $sub = (($xor) + -16843009)|0;
       $neg = $xor & -2139062144;
       $and15 = $neg ^ -2139062144;
       $and16 = $and15 & $sub;
       $lnot = ($and16|0)==(0);
       if (!($lnot)) {
        break;
       }
       $incdec$ptr21 = ((($w$034)) + 4|0);
       $sub22 = (($n$addr$133) + -4)|0;
       $cmp11 = ($sub22>>>0)>(3);
       if ($cmp11) {
        $n$addr$133 = $sub22;$w$034 = $incdec$ptr21;
       } else {
        $n$addr$1$lcssa = $sub22;$w$0$lcssa = $incdec$ptr21;
        label = 11;
        break L11;
       }
      }
      $n$addr$227 = $n$addr$133;$s$128 = $w$034;
     } else {
      $n$addr$1$lcssa = $n$addr$0$lcssa52;$w$0$lcssa = $s$0$lcssa53;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $tobool2526 = ($n$addr$1$lcssa|0)==(0);
     if ($tobool2526) {
      $n$addr$3 = 0;$s$2 = $w$0$lcssa;
      break;
     } else {
      $n$addr$227 = $n$addr$1$lcssa;$s$128 = $w$0$lcssa;
     }
    }
    while(1) {
     $7 = HEAP8[$s$128>>0]|0;
     $cmp28 = ($7<<24>>24)==($5<<24>>24);
     if ($cmp28) {
      $n$addr$3 = $n$addr$227;$s$2 = $s$128;
      break L8;
     }
     $incdec$ptr33 = ((($s$128)) + 1|0);
     $dec34 = (($n$addr$227) + -1)|0;
     $tobool25 = ($dec34|0)==(0);
     if ($tobool25) {
      $n$addr$3 = 0;$s$2 = $incdec$ptr33;
      break;
     } else {
      $n$addr$227 = $dec34;$s$128 = $incdec$ptr33;
     }
    }
   }
  }
 } while(0);
 $tobool36 = ($n$addr$3|0)!=(0);
 $cond = $tobool36 ? $s$2 : 0;
 return ($cond|0);
}
function _pad($f,$c,$w,$l,$fl) {
 $f = $f|0;
 $c = $c|0;
 $w = $w|0;
 $l = $l|0;
 $fl = $fl|0;
 var $0 = 0, $1 = 0, $2 = 0, $and = 0, $cmp = 0, $cmp3 = 0, $cmp38 = 0, $cond = 0, $l$addr$0$lcssa = 0, $l$addr$09 = 0, $or$cond = 0, $pad = 0, $sub = 0, $sub6 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $pad = sp;
 $and = $fl & 73728;
 $tobool = ($and|0)==(0);
 $cmp = ($w|0)>($l|0);
 $or$cond = $cmp & $tobool;
 if ($or$cond) {
  $sub = (($w) - ($l))|0;
  $0 = ($sub>>>0)<(256);
  $cond = $0 ? $sub : 256;
  _memset(($pad|0),($c|0),($cond|0))|0;
  $cmp38 = ($sub>>>0)>(255);
  if ($cmp38) {
   $1 = (($w) - ($l))|0;
   $l$addr$09 = $sub;
   while(1) {
    _out($f,$pad,256);
    $sub6 = (($l$addr$09) + -256)|0;
    $cmp3 = ($sub6>>>0)>(255);
    if ($cmp3) {
     $l$addr$09 = $sub6;
    } else {
     break;
    }
   }
   $2 = $1 & 255;
   $l$addr$0$lcssa = $2;
  } else {
   $l$addr$0$lcssa = $sub;
  }
  _out($f,$pad,$l$addr$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($s,$wc) {
 $s = $s|0;
 $wc = $wc|0;
 var $call = 0, $retval$0 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($s|0)==(0|0);
 if ($tobool) {
  $retval$0 = 0;
 } else {
  $call = (_wcrtomb($s,$wc,0)|0);
  $retval$0 = $call;
 }
 return ($retval$0|0);
}
function _fmt_fp($f,$y,$w,$p,$fl,$t) {
 $f = $f|0;
 $y = +$y;
 $w = $w|0;
 $p = $p|0;
 $fl = $fl|0;
 $t = $t|0;
 var $$ = 0, $$$ = 0, $$$405 = 0.0, $$394$ = 0, $$397 = 0.0, $$405 = 0.0, $$p = 0, $$p$inc468 = 0, $$pr = 0, $$pr407 = 0, $$pre = 0, $$pre487 = 0, $$sub514 = 0, $$sub562 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0;
 var $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0;
 var $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0;
 var $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $8 = 0, $9 = 0, $a$1$lcssa = 0, $a$1476 = 0, $a$2$ph = 0, $a$3$lcssa = 0, $a$3466 = 0, $a$5$lcssa = 0, $a$5448 = 0, $a$6 = 0, $a$8 = 0;
 var $a$9$ph = 0, $add = 0, $add$ptr213 = 0, $add$ptr311 = 0, $add$ptr311$z$4 = 0, $add$ptr354 = 0, $add$ptr358 = 0, $add$ptr373 = 0, $add$ptr442 = 0, $add$ptr442$z$3 = 0, $add$ptr65 = 0, $add$ptr671 = 0, $add$ptr742 = 0, $add$ptr756 = 0, $add113 = 0, $add150 = 0, $add150$pn = 0, $add165 = 0, $add273 = 0, $add275 = 0;
 var $add284 = 0, $add313 = 0, $add355 = 0, $add410 = 0.0, $add414 = 0, $add477$neg = 0, $add561 = 0, $add608 = 0, $add612 = 0, $add620 = 0, $add653 = 0, $add653$sink406 = 0, $add67 = 0, $add737 = 0, $add810 = 0, $add87 = 0.0, $add90 = 0.0, $and = 0, $and12 = 0, $and134 = 0;
 var $and282 = 0, $and36 = 0, $and379 = 0, $and45 = 0, $and483 = 0, $and610$pre$phiZ2D = 0, $and62 = 0, $arraydecay208$add$ptr213 = 0, $arrayidx = 0, $arrayidx117 = 0, $arrayidx251 = 0, $arrayidx453 = 0, $arrayidx489 = 0, $big = 0, $buf = 0, $call55 = 0.0, $carry$0471 = 0, $carry262$0462 = 0, $cmp103 = 0, $cmp127 = 0;
 var $cmp147 = 0, $cmp205 = 0, $cmp225 = 0, $cmp225474 = 0, $cmp235 = 0, $cmp235470 = 0, $cmp249 = 0, $cmp259 = 0, $cmp259464 = 0, $cmp277 = 0, $cmp277460 = 0, $cmp299 = 0, $cmp308 = 0, $cmp315 = 0, $cmp324 = 0, $cmp324456 = 0, $cmp333 = 0, $cmp338 = 0, $cmp350 = 0, $cmp363452 = 0;
 var $cmp374 = 0, $cmp38 = 0, $cmp385 = 0, $cmp390 = 0, $cmp403 = 0, $cmp411 = 0, $cmp416 = 0, $cmp416446 = 0, $cmp420 = 0, $cmp433 = 0, $cmp433442 = 0, $cmp443 = 0, $cmp450 = 0, $cmp450$lcssa = 0, $cmp470 = 0, $cmp473 = 0, $cmp495 = 0, $cmp495438 = 0, $cmp505 = 0, $cmp528 = 0;
 var $cmp577 = 0, $cmp59 = 0, $cmp614 = 0, $cmp617 = 0, $cmp623 = 0, $cmp636 = 0, $cmp636433 = 0, $cmp660 = 0, $cmp665 = 0, $cmp673 = 0, $cmp678 = 0, $cmp678419 = 0, $cmp68 = 0, $cmp686 = 0, $cmp707 = 0, $cmp707414 = 0, $cmp710 = 0, $cmp710415 = 0, $cmp722 = 0, $cmp722411 = 0;
 var $cmp745 = 0, $cmp748 = 0, $cmp748427 = 0, $cmp760 = 0, $cmp765 = 0, $cmp770 = 0, $cmp770423 = 0, $cmp777 = 0, $cmp790 = 0, $cmp818 = 0, $cmp82 = 0, $cmp94 = 0, $cond = 0, $cond100 = 0, $cond233 = 0, $cond271 = 0, $cond304 = 0, $cond43 = 0, $cond629 = 0, $cond732 = 0;
 var $cond800 = 0, $conv111 = 0, $conv114 = 0, $conv116 = 0, $conv118393 = 0, $conv121 = 0, $conv123 = 0.0, $conv216 = 0, $conv218 = 0.0, $conv644 = 0, $conv646 = 0, $d$0 = 0, $d$0469 = 0, $d$0472 = 0, $d$1461 = 0, $d$4 = 0, $d$5422 = 0, $d$6416 = 0, $d$7428 = 0, $dec = 0;
 var $dec476 = 0, $dec481 = 0, $dec78 = 0, $div274 = 0, $div356 = 0, $div378 = 0, $div384 = 0, $e$0458 = 0, $e$1 = 0, $e$2444 = 0, $e$4 = 0, $e$5$ph = 0, $e2 = 0, $ebuf0 = 0, $estr$0 = 0, $estr$1$lcssa = 0, $estr$1434 = 0, $estr$2 = 0, $exitcond = 0, $i$0457 = 0;
 var $i$1$lcssa = 0, $i$1453 = 0, $i$2443 = 0, $i$3439 = 0, $inc = 0, $inc425 = 0, $inc438 = 0, $inc468 = 0, $inc500 = 0, $incdec$ptr106 = 0, $incdec$ptr112 = 0, $incdec$ptr115 = 0, $incdec$ptr122 = 0, $incdec$ptr137 = 0, $incdec$ptr217 = 0, $incdec$ptr246 = 0, $incdec$ptr288 = 0, $incdec$ptr292 = 0, $incdec$ptr292$a$3 = 0, $incdec$ptr292$a$3492 = 0;
 var $incdec$ptr292$a$3494 = 0, $incdec$ptr292491 = 0, $incdec$ptr296 = 0, $incdec$ptr419 = 0, $incdec$ptr419$sink$lcssa = 0, $incdec$ptr419$sink447 = 0, $incdec$ptr423 = 0, $incdec$ptr639 = 0, $incdec$ptr645 = 0, $incdec$ptr647 = 0, $incdec$ptr681 = 0, $incdec$ptr689 = 0, $incdec$ptr698 = 0, $incdec$ptr725 = 0, $incdec$ptr734 = 0, $incdec$ptr763 = 0, $incdec$ptr773 = 0, $incdec$ptr776 = 0, $incdec$ptr808 = 0, $j$0 = 0;
 var $j$0451 = 0, $j$0454 = 0, $j$1440 = 0, $j$2 = 0, $l$0 = 0, $l$1 = 0, $land$ext$neg = 0, $lnot = 0, $lnot455 = 0, $lor$ext = 0, $mul = 0.0, $mul125 = 0.0, $mul202 = 0.0, $mul220 = 0.0, $mul286 = 0, $mul322 = 0, $mul328 = 0, $mul335 = 0, $mul349 = 0, $mul367 = 0;
 var $mul406 = 0.0, $mul406$$397 = 0.0, $mul407 = 0.0, $mul407$$$405 = 0.0, $mul431 = 0, $mul437 = 0, $mul499 = 0, $mul513 = 0, $mul80 = 0.0, $narrow = 0, $not$tobool341 = 0, $notlhs = 0, $notrhs = 0, $or = 0, $or$cond = 0, $or$cond1$not = 0, $or$cond2 = 0, $or$cond395 = 0, $or$cond396 = 0, $or$cond398 = 0;
 var $or$cond402 = 0, $or120 = 0, $or504 = 0, $or613 = 0, $p$addr$2 = 0, $p$addr$2$$sub514399 = 0, $p$addr$2$$sub562400 = 0, $p$addr$3 = 0, $p$addr$4$lcssa = 0, $p$addr$4417 = 0, $p$addr$5$lcssa = 0, $p$addr$5429 = 0, $pl$0 = 0, $prefix$0 = 0, $prefix$0$add$ptr65 = 0, $r$0$a$9 = 0, $re$1410 = 0, $rem360 = 0, $rem370 = 0, $rem494 = 0;
 var $rem494437 = 0, $round$0409 = 0.0, $round377$1 = 0.0, $s$0 = 0, $s$1 = 0, $s35$0 = 0, $s668$0420 = 0, $s668$1 = 0, $s715$0$lcssa = 0, $s715$0412 = 0, $s753$0 = 0, $s753$1424 = 0, $s753$2 = 0, $scevgep483 = 0, $scevgep483484 = 0, $shl280 = 0, $shr283 = 0, $shr285 = 0, $small$1 = 0.0, $sub = 0.0;
 var $sub$ptr$div = 0, $sub$ptr$div321 = 0, $sub$ptr$div347 = 0, $sub$ptr$div430 = 0, $sub$ptr$div511 = 0, $sub$ptr$lhs$cast = 0, $sub$ptr$lhs$cast143 = 0, $sub$ptr$lhs$cast151 = 0, $sub$ptr$lhs$cast305 = 0, $sub$ptr$lhs$cast318 = 0, $sub$ptr$lhs$cast344 = 0, $sub$ptr$lhs$cast508 = 0, $sub$ptr$lhs$cast633 = 0, $sub$ptr$lhs$cast694 = 0, $sub$ptr$lhs$cast787 = 0, $sub$ptr$lhs$cast811 = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$rhs$cast152 = 0, $sub$ptr$rhs$cast306 = 0, $sub$ptr$rhs$cast319 = 0;
 var $sub$ptr$rhs$cast428 = 0, $sub$ptr$rhs$cast634 = 0, $sub$ptr$rhs$cast634431 = 0, $sub$ptr$rhs$cast649 = 0, $sub$ptr$rhs$cast695 = 0, $sub$ptr$rhs$cast788 = 0, $sub$ptr$rhs$cast812 = 0, $sub$ptr$sub = 0, $sub$ptr$sub145 = 0, $sub$ptr$sub153 = 0, $sub$ptr$sub307 = 0, $sub$ptr$sub320 = 0, $sub$ptr$sub346 = 0, $sub$ptr$sub429 = 0, $sub$ptr$sub510 = 0, $sub$ptr$sub635 = 0, $sub$ptr$sub635432 = 0, $sub$ptr$sub650 = 0, $sub$ptr$sub650$pn = 0, $sub$ptr$sub696 = 0;
 var $sub$ptr$sub789 = 0, $sub$ptr$sub813 = 0, $sub124 = 0.0, $sub146 = 0, $sub181 = 0, $sub203 = 0, $sub219 = 0.0, $sub256 = 0, $sub264 = 0, $sub281 = 0, $sub336 = 0, $sub343 = 0, $sub357 = 0, $sub409 = 0, $sub478 = 0, $sub480 = 0, $sub514 = 0, $sub562 = 0, $sub626$le = 0, $sub735 = 0;
 var $sub74 = 0, $sub806 = 0, $sub85 = 0.0, $sub86 = 0.0, $sub88 = 0.0, $sub91 = 0.0, $sub97 = 0, $t$addr$0 = 0, $t$addr$1 = 0, $tobool13 = 0, $tobool135 = 0, $tobool139 = 0, $tobool140 = 0, $tobool222 = 0, $tobool244 = 0, $tobool290 = 0, $tobool290490 = 0, $tobool294 = 0, $tobool341 = 0, $tobool37 = 0;
 var $tobool371 = 0, $tobool380 = 0, $tobool400 = 0, $tobool484 = 0, $tobool490 = 0, $tobool56 = 0, $tobool63 = 0, $tobool76 = 0, $tobool76488 = 0, $tobool781 = 0, $tobool79 = 0, $tobool9 = 0, $w$add653 = 0, $xor = 0, $xor167 = 0, $xor186 = 0, $xor655 = 0, $xor816 = 0, $y$addr$0 = 0.0, $y$addr$1 = 0.0;
 var $y$addr$2 = 0.0, $y$addr$3 = 0.0, $y$addr$4 = 0.0, $z$0 = 0, $z$1$lcssa = 0, $z$1475 = 0, $z$2 = 0, $z$3$lcssa = 0, $z$3465 = 0, $z$4 = 0, $z$7 = 0, $z$7$add$ptr742 = 0, $z$7$ph = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $big = sp + 8|0;
 $e2 = sp;
 $buf = sp + 524|0;
 $sub$ptr$rhs$cast = $buf;
 $ebuf0 = sp + 512|0;
 HEAP32[$e2>>2] = 0;
 $arrayidx = ((($ebuf0)) + 12|0);
 (___DOUBLE_BITS($y)|0);
 $0 = tempRet0;
 $1 = ($0|0)<(0);
 if ($1) {
  $sub = -$y;
  $pl$0 = 1;$prefix$0 = 1505;$y$addr$0 = $sub;
 } else {
  $and = $fl & 2048;
  $tobool9 = ($and|0)==(0);
  $and12 = $fl & 1;
  $tobool13 = ($and12|0)==(0);
  $$ = $tobool13 ? (1506) : (1511);
  $$$ = $tobool9 ? $$ : (1508);
  $2 = $fl & 2049;
  $narrow = ($2|0)!=(0);
  $$394$ = $narrow&1;
  $pl$0 = $$394$;$prefix$0 = $$$;$y$addr$0 = $y;
 }
 (___DOUBLE_BITS($y$addr$0)|0);
 $3 = tempRet0;
 $4 = $3 & 2146435072;
 $5 = ($4>>>0)<(2146435072);
 $6 = (0)<(0);
 $7 = ($4|0)==(2146435072);
 $8 = $7 & $6;
 $9 = $5 | $8;
 do {
  if ($9) {
   $call55 = (+_frexpl($y$addr$0,$e2));
   $mul = $call55 * 2.0;
   $tobool56 = $mul != 0.0;
   if ($tobool56) {
    $10 = HEAP32[$e2>>2]|0;
    $dec = (($10) + -1)|0;
    HEAP32[$e2>>2] = $dec;
   }
   $or = $t | 32;
   $cmp59 = ($or|0)==(97);
   if ($cmp59) {
    $and62 = $t & 32;
    $tobool63 = ($and62|0)==(0);
    $add$ptr65 = ((($prefix$0)) + 9|0);
    $prefix$0$add$ptr65 = $tobool63 ? $prefix$0 : $add$ptr65;
    $add67 = $pl$0 | 2;
    $11 = ($p>>>0)>(11);
    $sub74 = (12 - ($p))|0;
    $tobool76488 = ($sub74|0)==(0);
    $tobool76 = $11 | $tobool76488;
    do {
     if ($tobool76) {
      $y$addr$1 = $mul;
     } else {
      $re$1410 = $sub74;$round$0409 = 8.0;
      while(1) {
       $dec78 = (($re$1410) + -1)|0;
       $mul80 = $round$0409 * 16.0;
       $tobool79 = ($dec78|0)==(0);
       if ($tobool79) {
        break;
       } else {
        $re$1410 = $dec78;$round$0409 = $mul80;
       }
      }
      $12 = HEAP8[$prefix$0$add$ptr65>>0]|0;
      $cmp82 = ($12<<24>>24)==(45);
      if ($cmp82) {
       $sub85 = -$mul;
       $sub86 = $sub85 - $mul80;
       $add87 = $mul80 + $sub86;
       $sub88 = -$add87;
       $y$addr$1 = $sub88;
       break;
      } else {
       $add90 = $mul + $mul80;
       $sub91 = $add90 - $mul80;
       $y$addr$1 = $sub91;
       break;
      }
     }
    } while(0);
    $13 = HEAP32[$e2>>2]|0;
    $cmp94 = ($13|0)<(0);
    $sub97 = (0 - ($13))|0;
    $cond100 = $cmp94 ? $sub97 : $13;
    $14 = ($cond100|0)<(0);
    $15 = $14 << 31 >> 31;
    $16 = (_fmt_u($cond100,$15,$arrayidx)|0);
    $cmp103 = ($16|0)==($arrayidx|0);
    if ($cmp103) {
     $incdec$ptr106 = ((($ebuf0)) + 11|0);
     HEAP8[$incdec$ptr106>>0] = 48;
     $estr$0 = $incdec$ptr106;
    } else {
     $estr$0 = $16;
    }
    $17 = $13 >> 31;
    $18 = $17 & 2;
    $19 = (($18) + 43)|0;
    $conv111 = $19&255;
    $incdec$ptr112 = ((($estr$0)) + -1|0);
    HEAP8[$incdec$ptr112>>0] = $conv111;
    $add113 = (($t) + 15)|0;
    $conv114 = $add113&255;
    $incdec$ptr115 = ((($estr$0)) + -2|0);
    HEAP8[$incdec$ptr115>>0] = $conv114;
    $notrhs = ($p|0)<(1);
    $and134 = $fl & 8;
    $tobool135 = ($and134|0)==(0);
    $s$0 = $buf;$y$addr$2 = $y$addr$1;
    while(1) {
     $conv116 = (~~(($y$addr$2)));
     $arrayidx117 = (1536 + ($conv116)|0);
     $20 = HEAP8[$arrayidx117>>0]|0;
     $conv118393 = $20&255;
     $or120 = $conv118393 | $and62;
     $conv121 = $or120&255;
     $incdec$ptr122 = ((($s$0)) + 1|0);
     HEAP8[$s$0>>0] = $conv121;
     $conv123 = (+($conv116|0));
     $sub124 = $y$addr$2 - $conv123;
     $mul125 = $sub124 * 16.0;
     $sub$ptr$lhs$cast = $incdec$ptr122;
     $sub$ptr$sub = (($sub$ptr$lhs$cast) - ($sub$ptr$rhs$cast))|0;
     $cmp127 = ($sub$ptr$sub|0)==(1);
     if ($cmp127) {
      $notlhs = $mul125 == 0.0;
      $or$cond1$not = $notrhs & $notlhs;
      $or$cond = $tobool135 & $or$cond1$not;
      if ($or$cond) {
       $s$1 = $incdec$ptr122;
      } else {
       $incdec$ptr137 = ((($s$0)) + 2|0);
       HEAP8[$incdec$ptr122>>0] = 46;
       $s$1 = $incdec$ptr137;
      }
     } else {
      $s$1 = $incdec$ptr122;
     }
     $tobool139 = $mul125 != 0.0;
     if ($tobool139) {
      $s$0 = $s$1;$y$addr$2 = $mul125;
     } else {
      break;
     }
    }
    $tobool140 = ($p|0)!=(0);
    $sub$ptr$rhs$cast152 = $incdec$ptr115;
    $sub$ptr$lhs$cast151 = $arrayidx;
    $sub$ptr$lhs$cast143 = $s$1;
    $sub$ptr$sub145 = (($sub$ptr$lhs$cast143) - ($sub$ptr$rhs$cast))|0;
    $sub$ptr$sub153 = (($sub$ptr$lhs$cast151) - ($sub$ptr$rhs$cast152))|0;
    $sub146 = (($sub$ptr$sub145) + -2)|0;
    $cmp147 = ($sub146|0)<($p|0);
    $or$cond395 = $tobool140 & $cmp147;
    $add150 = (($p) + 2)|0;
    $add150$pn = $or$cond395 ? $add150 : $sub$ptr$sub145;
    $l$0 = (($sub$ptr$sub153) + ($add67))|0;
    $add165 = (($l$0) + ($add150$pn))|0;
    _pad($f,32,$w,$add165,$fl);
    _out($f,$prefix$0$add$ptr65,$add67);
    $xor167 = $fl ^ 65536;
    _pad($f,48,$w,$add165,$xor167);
    _out($f,$buf,$sub$ptr$sub145);
    $sub181 = (($add150$pn) - ($sub$ptr$sub145))|0;
    _pad($f,48,$sub181,0,0);
    _out($f,$incdec$ptr115,$sub$ptr$sub153);
    $xor186 = $fl ^ 8192;
    _pad($f,32,$w,$add165,$xor186);
    $add653$sink406 = $add165;
    break;
   }
   $cmp68 = ($p|0)<(0);
   $$p = $cmp68 ? 6 : $p;
   if ($tobool56) {
    $mul202 = $mul * 268435456.0;
    $21 = HEAP32[$e2>>2]|0;
    $sub203 = (($21) + -28)|0;
    HEAP32[$e2>>2] = $sub203;
    $$pr = $sub203;$y$addr$3 = $mul202;
   } else {
    $$pre = HEAP32[$e2>>2]|0;
    $$pr = $$pre;$y$addr$3 = $mul;
   }
   $cmp205 = ($$pr|0)<(0);
   $add$ptr213 = ((($big)) + 288|0);
   $arraydecay208$add$ptr213 = $cmp205 ? $big : $add$ptr213;
   $y$addr$4 = $y$addr$3;$z$0 = $arraydecay208$add$ptr213;
   while(1) {
    $conv216 = (~~(($y$addr$4))>>>0);
    HEAP32[$z$0>>2] = $conv216;
    $incdec$ptr217 = ((($z$0)) + 4|0);
    $conv218 = (+($conv216>>>0));
    $sub219 = $y$addr$4 - $conv218;
    $mul220 = $sub219 * 1.0E+9;
    $tobool222 = $mul220 != 0.0;
    if ($tobool222) {
     $y$addr$4 = $mul220;$z$0 = $incdec$ptr217;
    } else {
     break;
    }
   }
   $cmp225474 = ($$pr|0)>(0);
   if ($cmp225474) {
    $22 = $$pr;$a$1476 = $arraydecay208$add$ptr213;$z$1475 = $incdec$ptr217;
    while(1) {
     $23 = ($22|0)<(29);
     $cond233 = $23 ? $22 : 29;
     $d$0469 = ((($z$1475)) + -4|0);
     $cmp235470 = ($d$0469>>>0)<($a$1476>>>0);
     if ($cmp235470) {
      $a$2$ph = $a$1476;
     } else {
      $carry$0471 = 0;$d$0472 = $d$0469;
      while(1) {
       $24 = HEAP32[$d$0472>>2]|0;
       $25 = (_bitshift64Shl(($24|0),0,($cond233|0))|0);
       $26 = tempRet0;
       $27 = (_i64Add(($25|0),($26|0),($carry$0471|0),0)|0);
       $28 = tempRet0;
       $29 = (___uremdi3(($27|0),($28|0),1000000000,0)|0);
       $30 = tempRet0;
       HEAP32[$d$0472>>2] = $29;
       $31 = (___udivdi3(($27|0),($28|0),1000000000,0)|0);
       $32 = tempRet0;
       $d$0 = ((($d$0472)) + -4|0);
       $cmp235 = ($d$0>>>0)<($a$1476>>>0);
       if ($cmp235) {
        break;
       } else {
        $carry$0471 = $31;$d$0472 = $d$0;
       }
      }
      $tobool244 = ($31|0)==(0);
      if ($tobool244) {
       $a$2$ph = $a$1476;
      } else {
       $incdec$ptr246 = ((($a$1476)) + -4|0);
       HEAP32[$incdec$ptr246>>2] = $31;
       $a$2$ph = $incdec$ptr246;
      }
     }
     $z$2 = $z$1475;
     while(1) {
      $cmp249 = ($z$2>>>0)>($a$2$ph>>>0);
      if (!($cmp249)) {
       break;
      }
      $arrayidx251 = ((($z$2)) + -4|0);
      $33 = HEAP32[$arrayidx251>>2]|0;
      $lnot = ($33|0)==(0);
      if ($lnot) {
       $z$2 = $arrayidx251;
      } else {
       break;
      }
     }
     $34 = HEAP32[$e2>>2]|0;
     $sub256 = (($34) - ($cond233))|0;
     HEAP32[$e2>>2] = $sub256;
     $cmp225 = ($sub256|0)>(0);
     if ($cmp225) {
      $22 = $sub256;$a$1476 = $a$2$ph;$z$1475 = $z$2;
     } else {
      $$pr407 = $sub256;$a$1$lcssa = $a$2$ph;$z$1$lcssa = $z$2;
      break;
     }
    }
   } else {
    $$pr407 = $$pr;$a$1$lcssa = $arraydecay208$add$ptr213;$z$1$lcssa = $incdec$ptr217;
   }
   $cmp259464 = ($$pr407|0)<(0);
   if ($cmp259464) {
    $add273 = (($$p) + 25)|0;
    $div274 = (($add273|0) / 9)&-1;
    $add275 = (($div274) + 1)|0;
    $cmp299 = ($or|0)==(102);
    $35 = $$pr407;$a$3466 = $a$1$lcssa;$z$3465 = $z$1$lcssa;
    while(1) {
     $sub264 = (0 - ($35))|0;
     $36 = ($sub264|0)<(9);
     $cond271 = $36 ? $sub264 : 9;
     $cmp277460 = ($a$3466>>>0)<($z$3465>>>0);
     if ($cmp277460) {
      $shl280 = 1 << $cond271;
      $sub281 = (($shl280) + -1)|0;
      $shr285 = 1000000000 >>> $cond271;
      $carry262$0462 = 0;$d$1461 = $a$3466;
      while(1) {
       $38 = HEAP32[$d$1461>>2]|0;
       $and282 = $38 & $sub281;
       $shr283 = $38 >>> $cond271;
       $add284 = (($shr283) + ($carry262$0462))|0;
       HEAP32[$d$1461>>2] = $add284;
       $mul286 = Math_imul($and282, $shr285)|0;
       $incdec$ptr288 = ((($d$1461)) + 4|0);
       $cmp277 = ($incdec$ptr288>>>0)<($z$3465>>>0);
       if ($cmp277) {
        $carry262$0462 = $mul286;$d$1461 = $incdec$ptr288;
       } else {
        break;
       }
      }
      $39 = HEAP32[$a$3466>>2]|0;
      $tobool290 = ($39|0)==(0);
      $incdec$ptr292 = ((($a$3466)) + 4|0);
      $incdec$ptr292$a$3 = $tobool290 ? $incdec$ptr292 : $a$3466;
      $tobool294 = ($mul286|0)==(0);
      if ($tobool294) {
       $incdec$ptr292$a$3494 = $incdec$ptr292$a$3;$z$4 = $z$3465;
      } else {
       $incdec$ptr296 = ((($z$3465)) + 4|0);
       HEAP32[$z$3465>>2] = $mul286;
       $incdec$ptr292$a$3494 = $incdec$ptr292$a$3;$z$4 = $incdec$ptr296;
      }
     } else {
      $37 = HEAP32[$a$3466>>2]|0;
      $tobool290490 = ($37|0)==(0);
      $incdec$ptr292491 = ((($a$3466)) + 4|0);
      $incdec$ptr292$a$3492 = $tobool290490 ? $incdec$ptr292491 : $a$3466;
      $incdec$ptr292$a$3494 = $incdec$ptr292$a$3492;$z$4 = $z$3465;
     }
     $cond304 = $cmp299 ? $arraydecay208$add$ptr213 : $incdec$ptr292$a$3494;
     $sub$ptr$lhs$cast305 = $z$4;
     $sub$ptr$rhs$cast306 = $cond304;
     $sub$ptr$sub307 = (($sub$ptr$lhs$cast305) - ($sub$ptr$rhs$cast306))|0;
     $sub$ptr$div = $sub$ptr$sub307 >> 2;
     $cmp308 = ($sub$ptr$div|0)>($add275|0);
     $add$ptr311 = (($cond304) + ($add275<<2)|0);
     $add$ptr311$z$4 = $cmp308 ? $add$ptr311 : $z$4;
     $40 = HEAP32[$e2>>2]|0;
     $add313 = (($40) + ($cond271))|0;
     HEAP32[$e2>>2] = $add313;
     $cmp259 = ($add313|0)<(0);
     if ($cmp259) {
      $35 = $add313;$a$3466 = $incdec$ptr292$a$3494;$z$3465 = $add$ptr311$z$4;
     } else {
      $a$3$lcssa = $incdec$ptr292$a$3494;$z$3$lcssa = $add$ptr311$z$4;
      break;
     }
    }
   } else {
    $a$3$lcssa = $a$1$lcssa;$z$3$lcssa = $z$1$lcssa;
   }
   $cmp315 = ($a$3$lcssa>>>0)<($z$3$lcssa>>>0);
   $sub$ptr$lhs$cast318 = $arraydecay208$add$ptr213;
   if ($cmp315) {
    $sub$ptr$rhs$cast319 = $a$3$lcssa;
    $sub$ptr$sub320 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast319))|0;
    $sub$ptr$div321 = $sub$ptr$sub320 >> 2;
    $mul322 = ($sub$ptr$div321*9)|0;
    $41 = HEAP32[$a$3$lcssa>>2]|0;
    $cmp324456 = ($41>>>0)<(10);
    if ($cmp324456) {
     $e$1 = $mul322;
    } else {
     $e$0458 = $mul322;$i$0457 = 10;
     while(1) {
      $mul328 = ($i$0457*10)|0;
      $inc = (($e$0458) + 1)|0;
      $cmp324 = ($41>>>0)<($mul328>>>0);
      if ($cmp324) {
       $e$1 = $inc;
       break;
      } else {
       $e$0458 = $inc;$i$0457 = $mul328;
      }
     }
    }
   } else {
    $e$1 = 0;
   }
   $cmp333 = ($or|0)!=(102);
   $mul335 = $cmp333 ? $e$1 : 0;
   $sub336 = (($$p) - ($mul335))|0;
   $cmp338 = ($or|0)==(103);
   $tobool341 = ($$p|0)!=(0);
   $42 = $tobool341 & $cmp338;
   $land$ext$neg = $42 << 31 >> 31;
   $sub343 = (($sub336) + ($land$ext$neg))|0;
   $sub$ptr$lhs$cast344 = $z$3$lcssa;
   $sub$ptr$sub346 = (($sub$ptr$lhs$cast344) - ($sub$ptr$lhs$cast318))|0;
   $sub$ptr$div347 = $sub$ptr$sub346 >> 2;
   $43 = ($sub$ptr$div347*9)|0;
   $mul349 = (($43) + -9)|0;
   $cmp350 = ($sub343|0)<($mul349|0);
   if ($cmp350) {
    $add$ptr354 = ((($arraydecay208$add$ptr213)) + 4|0);
    $add355 = (($sub343) + 9216)|0;
    $div356 = (($add355|0) / 9)&-1;
    $sub357 = (($div356) + -1024)|0;
    $add$ptr358 = (($add$ptr354) + ($sub357<<2)|0);
    $rem360 = (($add355|0) % 9)&-1;
    $j$0451 = (($rem360) + 1)|0;
    $cmp363452 = ($j$0451|0)<(9);
    if ($cmp363452) {
     $i$1453 = 10;$j$0454 = $j$0451;
     while(1) {
      $mul367 = ($i$1453*10)|0;
      $j$0 = (($j$0454) + 1)|0;
      $exitcond = ($j$0|0)==(9);
      if ($exitcond) {
       $i$1$lcssa = $mul367;
       break;
      } else {
       $i$1453 = $mul367;$j$0454 = $j$0;
      }
     }
    } else {
     $i$1$lcssa = 10;
    }
    $44 = HEAP32[$add$ptr358>>2]|0;
    $rem370 = (($44>>>0) % ($i$1$lcssa>>>0))&-1;
    $tobool371 = ($rem370|0)==(0);
    $add$ptr373 = ((($add$ptr358)) + 4|0);
    $cmp374 = ($add$ptr373|0)==($z$3$lcssa|0);
    $or$cond396 = $cmp374 & $tobool371;
    if ($or$cond396) {
     $a$8 = $a$3$lcssa;$d$4 = $add$ptr358;$e$4 = $e$1;
    } else {
     $div378 = (($44>>>0) / ($i$1$lcssa>>>0))&-1;
     $and379 = $div378 & 1;
     $tobool380 = ($and379|0)==(0);
     $$397 = $tobool380 ? 9007199254740992.0 : 9007199254740994.0;
     $div384 = (($i$1$lcssa|0) / 2)&-1;
     $cmp385 = ($rem370>>>0)<($div384>>>0);
     $cmp390 = ($rem370|0)==($div384|0);
     $or$cond398 = $cmp374 & $cmp390;
     $$405 = $or$cond398 ? 1.0 : 1.5;
     $$$405 = $cmp385 ? 0.5 : $$405;
     $tobool400 = ($pl$0|0)==(0);
     if ($tobool400) {
      $round377$1 = $$397;$small$1 = $$$405;
     } else {
      $45 = HEAP8[$prefix$0>>0]|0;
      $cmp403 = ($45<<24>>24)==(45);
      $mul406 = -$$397;
      $mul407 = -$$$405;
      $mul406$$397 = $cmp403 ? $mul406 : $$397;
      $mul407$$$405 = $cmp403 ? $mul407 : $$$405;
      $round377$1 = $mul406$$397;$small$1 = $mul407$$$405;
     }
     $sub409 = (($44) - ($rem370))|0;
     HEAP32[$add$ptr358>>2] = $sub409;
     $add410 = $round377$1 + $small$1;
     $cmp411 = $add410 != $round377$1;
     if ($cmp411) {
      $add414 = (($sub409) + ($i$1$lcssa))|0;
      HEAP32[$add$ptr358>>2] = $add414;
      $cmp416446 = ($add414>>>0)>(999999999);
      if ($cmp416446) {
       $a$5448 = $a$3$lcssa;$incdec$ptr419$sink447 = $add$ptr358;
       while(1) {
        $incdec$ptr419 = ((($incdec$ptr419$sink447)) + -4|0);
        HEAP32[$incdec$ptr419$sink447>>2] = 0;
        $cmp420 = ($incdec$ptr419>>>0)<($a$5448>>>0);
        if ($cmp420) {
         $incdec$ptr423 = ((($a$5448)) + -4|0);
         HEAP32[$incdec$ptr423>>2] = 0;
         $a$6 = $incdec$ptr423;
        } else {
         $a$6 = $a$5448;
        }
        $46 = HEAP32[$incdec$ptr419>>2]|0;
        $inc425 = (($46) + 1)|0;
        HEAP32[$incdec$ptr419>>2] = $inc425;
        $cmp416 = ($inc425>>>0)>(999999999);
        if ($cmp416) {
         $a$5448 = $a$6;$incdec$ptr419$sink447 = $incdec$ptr419;
        } else {
         $a$5$lcssa = $a$6;$incdec$ptr419$sink$lcssa = $incdec$ptr419;
         break;
        }
       }
      } else {
       $a$5$lcssa = $a$3$lcssa;$incdec$ptr419$sink$lcssa = $add$ptr358;
      }
      $sub$ptr$rhs$cast428 = $a$5$lcssa;
      $sub$ptr$sub429 = (($sub$ptr$lhs$cast318) - ($sub$ptr$rhs$cast428))|0;
      $sub$ptr$div430 = $sub$ptr$sub429 >> 2;
      $mul431 = ($sub$ptr$div430*9)|0;
      $47 = HEAP32[$a$5$lcssa>>2]|0;
      $cmp433442 = ($47>>>0)<(10);
      if ($cmp433442) {
       $a$8 = $a$5$lcssa;$d$4 = $incdec$ptr419$sink$lcssa;$e$4 = $mul431;
      } else {
       $e$2444 = $mul431;$i$2443 = 10;
       while(1) {
        $mul437 = ($i$2443*10)|0;
        $inc438 = (($e$2444) + 1)|0;
        $cmp433 = ($47>>>0)<($mul437>>>0);
        if ($cmp433) {
         $a$8 = $a$5$lcssa;$d$4 = $incdec$ptr419$sink$lcssa;$e$4 = $inc438;
         break;
        } else {
         $e$2444 = $inc438;$i$2443 = $mul437;
        }
       }
      }
     } else {
      $a$8 = $a$3$lcssa;$d$4 = $add$ptr358;$e$4 = $e$1;
     }
    }
    $add$ptr442 = ((($d$4)) + 4|0);
    $cmp443 = ($z$3$lcssa>>>0)>($add$ptr442>>>0);
    $add$ptr442$z$3 = $cmp443 ? $add$ptr442 : $z$3$lcssa;
    $a$9$ph = $a$8;$e$5$ph = $e$4;$z$7$ph = $add$ptr442$z$3;
   } else {
    $a$9$ph = $a$3$lcssa;$e$5$ph = $e$1;$z$7$ph = $z$3$lcssa;
   }
   $z$7 = $z$7$ph;
   while(1) {
    $cmp450 = ($z$7>>>0)>($a$9$ph>>>0);
    if (!($cmp450)) {
     $cmp450$lcssa = 0;
     break;
    }
    $arrayidx453 = ((($z$7)) + -4|0);
    $48 = HEAP32[$arrayidx453>>2]|0;
    $lnot455 = ($48|0)==(0);
    if ($lnot455) {
     $z$7 = $arrayidx453;
    } else {
     $cmp450$lcssa = 1;
     break;
    }
   }
   $sub626$le = (0 - ($e$5$ph))|0;
   do {
    if ($cmp338) {
     $not$tobool341 = $tobool341 ^ 1;
     $inc468 = $not$tobool341&1;
     $$p$inc468 = (($inc468) + ($$p))|0;
     $cmp470 = ($$p$inc468|0)>($e$5$ph|0);
     $cmp473 = ($e$5$ph|0)>(-5);
     $or$cond2 = $cmp470 & $cmp473;
     if ($or$cond2) {
      $dec476 = (($t) + -1)|0;
      $add477$neg = (($$p$inc468) + -1)|0;
      $sub478 = (($add477$neg) - ($e$5$ph))|0;
      $p$addr$2 = $sub478;$t$addr$0 = $dec476;
     } else {
      $sub480 = (($t) + -2)|0;
      $dec481 = (($$p$inc468) + -1)|0;
      $p$addr$2 = $dec481;$t$addr$0 = $sub480;
     }
     $and483 = $fl & 8;
     $tobool484 = ($and483|0)==(0);
     if ($tobool484) {
      if ($cmp450$lcssa) {
       $arrayidx489 = ((($z$7)) + -4|0);
       $49 = HEAP32[$arrayidx489>>2]|0;
       $tobool490 = ($49|0)==(0);
       if ($tobool490) {
        $j$2 = 9;
       } else {
        $rem494437 = (($49>>>0) % 10)&-1;
        $cmp495438 = ($rem494437|0)==(0);
        if ($cmp495438) {
         $i$3439 = 10;$j$1440 = 0;
         while(1) {
          $mul499 = ($i$3439*10)|0;
          $inc500 = (($j$1440) + 1)|0;
          $rem494 = (($49>>>0) % ($mul499>>>0))&-1;
          $cmp495 = ($rem494|0)==(0);
          if ($cmp495) {
           $i$3439 = $mul499;$j$1440 = $inc500;
          } else {
           $j$2 = $inc500;
           break;
          }
         }
        } else {
         $j$2 = 0;
        }
       }
      } else {
       $j$2 = 9;
      }
      $or504 = $t$addr$0 | 32;
      $cmp505 = ($or504|0)==(102);
      $sub$ptr$lhs$cast508 = $z$7;
      $sub$ptr$sub510 = (($sub$ptr$lhs$cast508) - ($sub$ptr$lhs$cast318))|0;
      $sub$ptr$div511 = $sub$ptr$sub510 >> 2;
      $50 = ($sub$ptr$div511*9)|0;
      $mul513 = (($50) + -9)|0;
      if ($cmp505) {
       $sub514 = (($mul513) - ($j$2))|0;
       $51 = ($sub514|0)>(0);
       $$sub514 = $51 ? $sub514 : 0;
       $cmp528 = ($p$addr$2|0)<($$sub514|0);
       $p$addr$2$$sub514399 = $cmp528 ? $p$addr$2 : $$sub514;
       $and610$pre$phiZ2D = 0;$p$addr$3 = $p$addr$2$$sub514399;$t$addr$1 = $t$addr$0;
       break;
      } else {
       $add561 = (($mul513) + ($e$5$ph))|0;
       $sub562 = (($add561) - ($j$2))|0;
       $52 = ($sub562|0)>(0);
       $$sub562 = $52 ? $sub562 : 0;
       $cmp577 = ($p$addr$2|0)<($$sub562|0);
       $p$addr$2$$sub562400 = $cmp577 ? $p$addr$2 : $$sub562;
       $and610$pre$phiZ2D = 0;$p$addr$3 = $p$addr$2$$sub562400;$t$addr$1 = $t$addr$0;
       break;
      }
     } else {
      $and610$pre$phiZ2D = $and483;$p$addr$3 = $p$addr$2;$t$addr$1 = $t$addr$0;
     }
    } else {
     $$pre487 = $fl & 8;
     $and610$pre$phiZ2D = $$pre487;$p$addr$3 = $$p;$t$addr$1 = $t;
    }
   } while(0);
   $53 = $p$addr$3 | $and610$pre$phiZ2D;
   $54 = ($53|0)!=(0);
   $lor$ext = $54&1;
   $or613 = $t$addr$1 | 32;
   $cmp614 = ($or613|0)==(102);
   if ($cmp614) {
    $cmp617 = ($e$5$ph|0)>(0);
    $add620 = $cmp617 ? $e$5$ph : 0;
    $estr$2 = 0;$sub$ptr$sub650$pn = $add620;
   } else {
    $cmp623 = ($e$5$ph|0)<(0);
    $cond629 = $cmp623 ? $sub626$le : $e$5$ph;
    $55 = ($cond629|0)<(0);
    $56 = $55 << 31 >> 31;
    $57 = (_fmt_u($cond629,$56,$arrayidx)|0);
    $sub$ptr$lhs$cast633 = $arrayidx;
    $sub$ptr$rhs$cast634431 = $57;
    $sub$ptr$sub635432 = (($sub$ptr$lhs$cast633) - ($sub$ptr$rhs$cast634431))|0;
    $cmp636433 = ($sub$ptr$sub635432|0)<(2);
    if ($cmp636433) {
     $estr$1434 = $57;
     while(1) {
      $incdec$ptr639 = ((($estr$1434)) + -1|0);
      HEAP8[$incdec$ptr639>>0] = 48;
      $sub$ptr$rhs$cast634 = $incdec$ptr639;
      $sub$ptr$sub635 = (($sub$ptr$lhs$cast633) - ($sub$ptr$rhs$cast634))|0;
      $cmp636 = ($sub$ptr$sub635|0)<(2);
      if ($cmp636) {
       $estr$1434 = $incdec$ptr639;
      } else {
       $estr$1$lcssa = $incdec$ptr639;
       break;
      }
     }
    } else {
     $estr$1$lcssa = $57;
    }
    $58 = $e$5$ph >> 31;
    $59 = $58 & 2;
    $60 = (($59) + 43)|0;
    $conv644 = $60&255;
    $incdec$ptr645 = ((($estr$1$lcssa)) + -1|0);
    HEAP8[$incdec$ptr645>>0] = $conv644;
    $conv646 = $t$addr$1&255;
    $incdec$ptr647 = ((($estr$1$lcssa)) + -2|0);
    HEAP8[$incdec$ptr647>>0] = $conv646;
    $sub$ptr$rhs$cast649 = $incdec$ptr647;
    $sub$ptr$sub650 = (($sub$ptr$lhs$cast633) - ($sub$ptr$rhs$cast649))|0;
    $estr$2 = $incdec$ptr647;$sub$ptr$sub650$pn = $sub$ptr$sub650;
   }
   $add608 = (($pl$0) + 1)|0;
   $add612 = (($add608) + ($p$addr$3))|0;
   $l$1 = (($add612) + ($lor$ext))|0;
   $add653 = (($l$1) + ($sub$ptr$sub650$pn))|0;
   _pad($f,32,$w,$add653,$fl);
   _out($f,$prefix$0,$pl$0);
   $xor655 = $fl ^ 65536;
   _pad($f,48,$w,$add653,$xor655);
   if ($cmp614) {
    $cmp660 = ($a$9$ph>>>0)>($arraydecay208$add$ptr213>>>0);
    $r$0$a$9 = $cmp660 ? $arraydecay208$add$ptr213 : $a$9$ph;
    $add$ptr671 = ((($buf)) + 9|0);
    $sub$ptr$lhs$cast694 = $add$ptr671;
    $incdec$ptr689 = ((($buf)) + 8|0);
    $d$5422 = $r$0$a$9;
    while(1) {
     $61 = HEAP32[$d$5422>>2]|0;
     $62 = (_fmt_u($61,0,$add$ptr671)|0);
     $cmp673 = ($d$5422|0)==($r$0$a$9|0);
     if ($cmp673) {
      $cmp686 = ($62|0)==($add$ptr671|0);
      if ($cmp686) {
       HEAP8[$incdec$ptr689>>0] = 48;
       $s668$1 = $incdec$ptr689;
      } else {
       $s668$1 = $62;
      }
     } else {
      $cmp678419 = ($62>>>0)>($buf>>>0);
      if ($cmp678419) {
       $63 = $62;
       $64 = (($63) - ($sub$ptr$rhs$cast))|0;
       _memset(($buf|0),48,($64|0))|0;
       $s668$0420 = $62;
       while(1) {
        $incdec$ptr681 = ((($s668$0420)) + -1|0);
        $cmp678 = ($incdec$ptr681>>>0)>($buf>>>0);
        if ($cmp678) {
         $s668$0420 = $incdec$ptr681;
        } else {
         $s668$1 = $incdec$ptr681;
         break;
        }
       }
      } else {
       $s668$1 = $62;
      }
     }
     $sub$ptr$rhs$cast695 = $s668$1;
     $sub$ptr$sub696 = (($sub$ptr$lhs$cast694) - ($sub$ptr$rhs$cast695))|0;
     _out($f,$s668$1,$sub$ptr$sub696);
     $incdec$ptr698 = ((($d$5422)) + 4|0);
     $cmp665 = ($incdec$ptr698>>>0)>($arraydecay208$add$ptr213>>>0);
     if ($cmp665) {
      break;
     } else {
      $d$5422 = $incdec$ptr698;
     }
    }
    $65 = ($53|0)==(0);
    if (!($65)) {
     _out($f,1552,1);
    }
    $cmp707414 = ($incdec$ptr698>>>0)<($z$7>>>0);
    $cmp710415 = ($p$addr$3|0)>(0);
    $66 = $cmp707414 & $cmp710415;
    if ($66) {
     $d$6416 = $incdec$ptr698;$p$addr$4417 = $p$addr$3;
     while(1) {
      $67 = HEAP32[$d$6416>>2]|0;
      $68 = (_fmt_u($67,0,$add$ptr671)|0);
      $cmp722411 = ($68>>>0)>($buf>>>0);
      if ($cmp722411) {
       $69 = $68;
       $70 = (($69) - ($sub$ptr$rhs$cast))|0;
       _memset(($buf|0),48,($70|0))|0;
       $s715$0412 = $68;
       while(1) {
        $incdec$ptr725 = ((($s715$0412)) + -1|0);
        $cmp722 = ($incdec$ptr725>>>0)>($buf>>>0);
        if ($cmp722) {
         $s715$0412 = $incdec$ptr725;
        } else {
         $s715$0$lcssa = $incdec$ptr725;
         break;
        }
       }
      } else {
       $s715$0$lcssa = $68;
      }
      $71 = ($p$addr$4417|0)<(9);
      $cond732 = $71 ? $p$addr$4417 : 9;
      _out($f,$s715$0$lcssa,$cond732);
      $incdec$ptr734 = ((($d$6416)) + 4|0);
      $sub735 = (($p$addr$4417) + -9)|0;
      $cmp707 = ($incdec$ptr734>>>0)<($z$7>>>0);
      $cmp710 = ($p$addr$4417|0)>(9);
      $72 = $cmp707 & $cmp710;
      if ($72) {
       $d$6416 = $incdec$ptr734;$p$addr$4417 = $sub735;
      } else {
       $p$addr$4$lcssa = $sub735;
       break;
      }
     }
    } else {
     $p$addr$4$lcssa = $p$addr$3;
    }
    $add737 = (($p$addr$4$lcssa) + 9)|0;
    _pad($f,48,$add737,9,0);
   } else {
    $add$ptr742 = ((($a$9$ph)) + 4|0);
    $z$7$add$ptr742 = $cmp450$lcssa ? $z$7 : $add$ptr742;
    $cmp748427 = ($p$addr$3|0)>(-1);
    if ($cmp748427) {
     $add$ptr756 = ((($buf)) + 9|0);
     $tobool781 = ($and610$pre$phiZ2D|0)==(0);
     $sub$ptr$lhs$cast787 = $add$ptr756;
     $73 = (0 - ($sub$ptr$rhs$cast))|0;
     $incdec$ptr763 = ((($buf)) + 8|0);
     $d$7428 = $a$9$ph;$p$addr$5429 = $p$addr$3;
     while(1) {
      $74 = HEAP32[$d$7428>>2]|0;
      $75 = (_fmt_u($74,0,$add$ptr756)|0);
      $cmp760 = ($75|0)==($add$ptr756|0);
      if ($cmp760) {
       HEAP8[$incdec$ptr763>>0] = 48;
       $s753$0 = $incdec$ptr763;
      } else {
       $s753$0 = $75;
      }
      $cmp765 = ($d$7428|0)==($a$9$ph|0);
      do {
       if ($cmp765) {
        $incdec$ptr776 = ((($s753$0)) + 1|0);
        _out($f,$s753$0,1);
        $cmp777 = ($p$addr$5429|0)<(1);
        $or$cond402 = $tobool781 & $cmp777;
        if ($or$cond402) {
         $s753$2 = $incdec$ptr776;
         break;
        }
        _out($f,1552,1);
        $s753$2 = $incdec$ptr776;
       } else {
        $cmp770423 = ($s753$0>>>0)>($buf>>>0);
        if (!($cmp770423)) {
         $s753$2 = $s753$0;
         break;
        }
        $scevgep483 = (($s753$0) + ($73)|0);
        $scevgep483484 = $scevgep483;
        _memset(($buf|0),48,($scevgep483484|0))|0;
        $s753$1424 = $s753$0;
        while(1) {
         $incdec$ptr773 = ((($s753$1424)) + -1|0);
         $cmp770 = ($incdec$ptr773>>>0)>($buf>>>0);
         if ($cmp770) {
          $s753$1424 = $incdec$ptr773;
         } else {
          $s753$2 = $incdec$ptr773;
          break;
         }
        }
       }
      } while(0);
      $sub$ptr$rhs$cast788 = $s753$2;
      $sub$ptr$sub789 = (($sub$ptr$lhs$cast787) - ($sub$ptr$rhs$cast788))|0;
      $cmp790 = ($p$addr$5429|0)>($sub$ptr$sub789|0);
      $cond800 = $cmp790 ? $sub$ptr$sub789 : $p$addr$5429;
      _out($f,$s753$2,$cond800);
      $sub806 = (($p$addr$5429) - ($sub$ptr$sub789))|0;
      $incdec$ptr808 = ((($d$7428)) + 4|0);
      $cmp745 = ($incdec$ptr808>>>0)<($z$7$add$ptr742>>>0);
      $cmp748 = ($sub806|0)>(-1);
      $76 = $cmp745 & $cmp748;
      if ($76) {
       $d$7428 = $incdec$ptr808;$p$addr$5429 = $sub806;
      } else {
       $p$addr$5$lcssa = $sub806;
       break;
      }
     }
    } else {
     $p$addr$5$lcssa = $p$addr$3;
    }
    $add810 = (($p$addr$5$lcssa) + 18)|0;
    _pad($f,48,$add810,18,0);
    $sub$ptr$lhs$cast811 = $arrayidx;
    $sub$ptr$rhs$cast812 = $estr$2;
    $sub$ptr$sub813 = (($sub$ptr$lhs$cast811) - ($sub$ptr$rhs$cast812))|0;
    _out($f,$estr$2,$sub$ptr$sub813);
   }
   $xor816 = $fl ^ 8192;
   _pad($f,32,$w,$add653,$xor816);
   $add653$sink406 = $add653;
  } else {
   $and36 = $t & 32;
   $tobool37 = ($and36|0)!=(0);
   $cond = $tobool37 ? 1524 : 1528;
   $cmp38 = ($y$addr$0 != $y$addr$0) | (0.0 != 0.0);
   $cond43 = $tobool37 ? 3455 : 1532;
   $s35$0 = $cmp38 ? $cond43 : $cond;
   $add = (($pl$0) + 3)|0;
   $and45 = $fl & -65537;
   _pad($f,32,$w,$add,$and45);
   _out($f,$prefix$0,$pl$0);
   _out($f,$s35$0,3);
   $xor = $fl ^ 8192;
   _pad($f,32,$w,$add,$xor);
   $add653$sink406 = $add;
  }
 } while(0);
 $cmp818 = ($add653$sink406|0)<($w|0);
 $w$add653 = $cmp818 ? $w : $add653$sink406;
 STACKTOP = sp;return ($w$add653|0);
}
function ___DOUBLE_BITS($__f) {
 $__f = +$__f;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $__f;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($1);
 return ($0|0);
}
function _frexpl($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $call = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (+_frexp($x,$e));
 return (+$call);
}
function _frexp($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $call = 0.0, $conv = 0, $mul = 0.0, $retval$0 = 0.0, $storemerge = 0, $sub = 0, $sub8 = 0, $tobool1 = 0, $trunc$clear = 0, $x$addr$0 = 0.0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $x;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 $2 = (_bitshift64Lshr(($0|0),($1|0),52)|0);
 $3 = tempRet0;
 $4 = $2&65535;
 $trunc$clear = $4 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $tobool1 = $x != 0.0;
  if ($tobool1) {
   $mul = $x * 1.8446744073709552E+19;
   $call = (+_frexp($mul,$e));
   $5 = HEAP32[$e>>2]|0;
   $sub = (($5) + -64)|0;
   $storemerge = $sub;$x$addr$0 = $call;
  } else {
   $storemerge = 0;$x$addr$0 = $x;
  }
  HEAP32[$e>>2] = $storemerge;
  $retval$0 = $x$addr$0;
  break;
 }
 case 2047:  {
  $retval$0 = $x;
  break;
 }
 default: {
  $conv = $2 & 2047;
  $sub8 = (($conv) + -1022)|0;
  HEAP32[$e>>2] = $sub8;
  $6 = $1 & -2146435073;
  $7 = $6 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $0;HEAP32[tempDoublePtr+4>>2] = $7;$8 = +HEAPF64[tempDoublePtr>>3];
  $retval$0 = $8;
 }
 }
 return (+$retval$0);
}
function _wcrtomb($s,$wc,$st) {
 $s = $s|0;
 $wc = $wc|0;
 $st = $st|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $and = 0, $and32 = 0, $and36 = 0, $and49 = 0, $and54 = 0, $and58 = 0, $call = 0, $call10 = 0, $call66 = 0, $cmp = 0, $cmp14 = 0, $cmp21 = 0, $cmp24 = 0, $cmp41 = 0, $cmp7 = 0, $conv = 0;
 var $conv12 = 0, $conv17 = 0, $conv19 = 0, $conv29 = 0, $conv34 = 0, $conv38 = 0, $conv46 = 0, $conv51 = 0, $conv56 = 0, $conv60 = 0, $incdec$ptr = 0, $incdec$ptr30 = 0, $incdec$ptr35 = 0, $incdec$ptr47 = 0, $incdec$ptr52 = 0, $incdec$ptr57 = 0, $locale = 0, $not$tobool2 = 0, $or = 0, $or$cond = 0;
 var $or18 = 0, $or28 = 0, $or33 = 0, $or37 = 0, $or45 = 0, $or50 = 0, $or55 = 0, $or59 = 0, $retval$0 = 0, $shr2729 = 0, $shr3130 = 0, $shr32 = 0, $shr4426 = 0, $shr4827 = 0, $shr5328 = 0, $sub40 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($s|0)==(0|0);
 do {
  if ($tobool) {
   $retval$0 = 1;
  } else {
   $cmp = ($wc>>>0)<(128);
   if ($cmp) {
    $conv = $wc&255;
    HEAP8[$s>>0] = $conv;
    $retval$0 = 1;
    break;
   }
   $call = (___pthread_self_555()|0);
   $locale = ((($call)) + 188|0);
   $0 = HEAP32[$locale>>2]|0;
   $1 = HEAP32[$0>>2]|0;
   $not$tobool2 = ($1|0)==(0|0);
   if ($not$tobool2) {
    $2 = $wc & -128;
    $cmp7 = ($2|0)==(57216);
    if ($cmp7) {
     $conv12 = $wc&255;
     HEAP8[$s>>0] = $conv12;
     $retval$0 = 1;
     break;
    } else {
     $call10 = (___errno_location()|0);
     HEAP32[$call10>>2] = 84;
     $retval$0 = -1;
     break;
    }
   }
   $cmp14 = ($wc>>>0)<(2048);
   if ($cmp14) {
    $shr32 = $wc >>> 6;
    $or = $shr32 | 192;
    $conv17 = $or&255;
    $incdec$ptr = ((($s)) + 1|0);
    HEAP8[$s>>0] = $conv17;
    $and = $wc & 63;
    $or18 = $and | 128;
    $conv19 = $or18&255;
    HEAP8[$incdec$ptr>>0] = $conv19;
    $retval$0 = 2;
    break;
   }
   $cmp21 = ($wc>>>0)<(55296);
   $3 = $wc & -8192;
   $cmp24 = ($3|0)==(57344);
   $or$cond = $cmp21 | $cmp24;
   if ($or$cond) {
    $shr2729 = $wc >>> 12;
    $or28 = $shr2729 | 224;
    $conv29 = $or28&255;
    $incdec$ptr30 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $conv29;
    $shr3130 = $wc >>> 6;
    $and32 = $shr3130 & 63;
    $or33 = $and32 | 128;
    $conv34 = $or33&255;
    $incdec$ptr35 = ((($s)) + 2|0);
    HEAP8[$incdec$ptr30>>0] = $conv34;
    $and36 = $wc & 63;
    $or37 = $and36 | 128;
    $conv38 = $or37&255;
    HEAP8[$incdec$ptr35>>0] = $conv38;
    $retval$0 = 3;
    break;
   }
   $sub40 = (($wc) + -65536)|0;
   $cmp41 = ($sub40>>>0)<(1048576);
   if ($cmp41) {
    $shr4426 = $wc >>> 18;
    $or45 = $shr4426 | 240;
    $conv46 = $or45&255;
    $incdec$ptr47 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $conv46;
    $shr4827 = $wc >>> 12;
    $and49 = $shr4827 & 63;
    $or50 = $and49 | 128;
    $conv51 = $or50&255;
    $incdec$ptr52 = ((($s)) + 2|0);
    HEAP8[$incdec$ptr47>>0] = $conv51;
    $shr5328 = $wc >>> 6;
    $and54 = $shr5328 & 63;
    $or55 = $and54 | 128;
    $conv56 = $or55&255;
    $incdec$ptr57 = ((($s)) + 3|0);
    HEAP8[$incdec$ptr52>>0] = $conv56;
    $and58 = $wc & 63;
    $or59 = $and58 | 128;
    $conv60 = $or59&255;
    HEAP8[$incdec$ptr57>>0] = $conv60;
    $retval$0 = 4;
    break;
   } else {
    $call66 = (___errno_location()|0);
    HEAP32[$call66>>2] = 84;
    $retval$0 = -1;
    break;
   }
  }
 } while(0);
 return ($retval$0|0);
}
function ___pthread_self_555() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_pthread_self()|0);
 return ($call|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (600|0);
}
function ___pthread_self_654() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_pthread_self()|0);
 return ($call|0);
}
function ___strerror_l($e,$loc) {
 $e = $e|0;
 $loc = $loc|0;
 var $0 = 0, $1 = 0, $2 = 0, $arrayidx = 0, $arrayidx15 = 0, $call = 0, $cmp = 0, $conv = 0, $dec = 0, $i$012 = 0, $i$111 = 0, $inc = 0, $incdec$ptr = 0, $s$0$lcssa = 0, $s$010 = 0, $s$1 = 0, $tobool = 0, $tobool5 = 0, $tobool59 = 0, $tobool8 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $i$012 = 0;
 while(1) {
  $arrayidx = (1554 + ($i$012)|0);
  $0 = HEAP8[$arrayidx>>0]|0;
  $conv = $0&255;
  $cmp = ($conv|0)==($e|0);
  if ($cmp) {
   label = 2;
   break;
  }
  $inc = (($i$012) + 1)|0;
  $tobool = ($inc|0)==(87);
  if ($tobool) {
   $i$111 = 87;$s$010 = 1642;
   label = 5;
   break;
  } else {
   $i$012 = $inc;
  }
 }
 if ((label|0) == 2) {
  $tobool59 = ($i$012|0)==(0);
  if ($tobool59) {
   $s$0$lcssa = 1642;
  } else {
   $i$111 = $i$012;$s$010 = 1642;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $s$1 = $s$010;
   while(1) {
    $1 = HEAP8[$s$1>>0]|0;
    $tobool8 = ($1<<24>>24)==(0);
    $incdec$ptr = ((($s$1)) + 1|0);
    if ($tobool8) {
     break;
    } else {
     $s$1 = $incdec$ptr;
    }
   }
   $dec = (($i$111) + -1)|0;
   $tobool5 = ($dec|0)==(0);
   if ($tobool5) {
    $s$0$lcssa = $incdec$ptr;
    break;
   } else {
    $i$111 = $dec;$s$010 = $incdec$ptr;
    label = 5;
   }
  }
 }
 $arrayidx15 = ((($loc)) + 20|0);
 $2 = HEAP32[$arrayidx15>>2]|0;
 $call = (___lctrans($s$0$lcssa,$2)|0);
 return ($call|0);
}
function ___lctrans($msg,$lm) {
 $msg = $msg|0;
 $lm = $lm|0;
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (___lctrans_impl($msg,$lm)|0);
 return ($call|0);
}
function ___lctrans_impl($msg,$lm) {
 $msg = $msg|0;
 $lm = $lm|0;
 var $0 = 0, $1 = 0, $call = 0, $cond = 0, $map_size = 0, $tobool = 0, $tobool1 = 0, $trans$0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($lm|0)==(0|0);
 if ($tobool) {
  $trans$0 = 0;
 } else {
  $0 = HEAP32[$lm>>2]|0;
  $map_size = ((($lm)) + 4|0);
  $1 = HEAP32[$map_size>>2]|0;
  $call = (___mo_lookup($0,$1,$msg)|0);
  $trans$0 = $call;
 }
 $tobool1 = ($trans$0|0)!=(0|0);
 $cond = $tobool1 ? $trans$0 : $msg;
 return ($cond|0);
}
function ___mo_lookup($p,$size,$s) {
 $p = $p|0;
 $size = $size|0;
 $s = $s|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add$ptr = 0, $add$ptr65 = 0, $add$ptr65$ = 0, $add16 = 0, $add23 = 0, $add31 = 0, $add42 = 0, $add49 = 0, $add59 = 0;
 var $arrayidx = 0, $arrayidx1 = 0, $arrayidx17 = 0, $arrayidx24 = 0, $arrayidx3 = 0, $arrayidx32 = 0, $arrayidx43 = 0, $arrayidx50 = 0, $arrayidx60 = 0, $b$0 = 0, $b$1 = 0, $call = 0, $call18 = 0, $call2 = 0, $call25 = 0, $call36 = 0, $call4 = 0, $call44 = 0, $call51 = 0, $cmp = 0;
 var $cmp10 = 0, $cmp26 = 0, $cmp29 = 0, $cmp52 = 0, $cmp56 = 0, $cmp6 = 0, $cmp67 = 0, $cmp71 = 0, $div = 0, $div12 = 0, $div13 = 0, $div14 = 0, $mul = 0, $mul15 = 0, $n$0 = 0, $n$1 = 0, $or = 0, $or$cond = 0, $or$cond66 = 0, $or$cond67 = 0;
 var $rem = 0, $retval$4 = 0, $sub = 0, $sub28 = 0, $sub5 = 0, $sub55 = 0, $sub79 = 0, $tobool = 0, $tobool33 = 0, $tobool37 = 0, $tobool62 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$p>>2]|0;
 $sub = (($0) + 1794895138)|0;
 $arrayidx = ((($p)) + 8|0);
 $1 = HEAP32[$arrayidx>>2]|0;
 $call = (_swapc($1,$sub)|0);
 $arrayidx1 = ((($p)) + 12|0);
 $2 = HEAP32[$arrayidx1>>2]|0;
 $call2 = (_swapc($2,$sub)|0);
 $arrayidx3 = ((($p)) + 16|0);
 $3 = HEAP32[$arrayidx3>>2]|0;
 $call4 = (_swapc($3,$sub)|0);
 $div = $size >>> 2;
 $cmp = ($call>>>0)<($div>>>0);
 L1: do {
  if ($cmp) {
   $mul = $call << 2;
   $sub5 = (($size) - ($mul))|0;
   $cmp6 = ($call2>>>0)<($sub5>>>0);
   $cmp10 = ($call4>>>0)<($sub5>>>0);
   $or$cond = $cmp6 & $cmp10;
   if ($or$cond) {
    $or = $call4 | $call2;
    $rem = $or & 3;
    $tobool = ($rem|0)==(0);
    if ($tobool) {
     $div12 = $call2 >>> 2;
     $div13 = $call4 >>> 2;
     $b$0 = 0;$n$0 = $call;
     while(1) {
      $div14 = $n$0 >>> 1;
      $add = (($b$0) + ($div14))|0;
      $mul15 = $add << 1;
      $add16 = (($mul15) + ($div12))|0;
      $arrayidx17 = (($p) + ($add16<<2)|0);
      $4 = HEAP32[$arrayidx17>>2]|0;
      $call18 = (_swapc($4,$sub)|0);
      $add23 = (($add16) + 1)|0;
      $arrayidx24 = (($p) + ($add23<<2)|0);
      $5 = HEAP32[$arrayidx24>>2]|0;
      $call25 = (_swapc($5,$sub)|0);
      $cmp26 = ($call25>>>0)<($size>>>0);
      $sub28 = (($size) - ($call25))|0;
      $cmp29 = ($call18>>>0)<($sub28>>>0);
      $or$cond66 = $cmp26 & $cmp29;
      if (!($or$cond66)) {
       $retval$4 = 0;
       break L1;
      }
      $add31 = (($call25) + ($call18))|0;
      $arrayidx32 = (($p) + ($add31)|0);
      $6 = HEAP8[$arrayidx32>>0]|0;
      $tobool33 = ($6<<24>>24)==(0);
      if (!($tobool33)) {
       $retval$4 = 0;
       break L1;
      }
      $add$ptr = (($p) + ($call25)|0);
      $call36 = (_strcmp($s,$add$ptr)|0);
      $tobool37 = ($call36|0)==(0);
      if ($tobool37) {
       break;
      }
      $cmp67 = ($n$0|0)==(1);
      $cmp71 = ($call36|0)<(0);
      $sub79 = (($n$0) - ($div14))|0;
      $n$1 = $cmp71 ? $div14 : $sub79;
      $b$1 = $cmp71 ? $b$0 : $add;
      if ($cmp67) {
       $retval$4 = 0;
       break L1;
      } else {
       $b$0 = $b$1;$n$0 = $n$1;
      }
     }
     $add42 = (($mul15) + ($div13))|0;
     $arrayidx43 = (($p) + ($add42<<2)|0);
     $7 = HEAP32[$arrayidx43>>2]|0;
     $call44 = (_swapc($7,$sub)|0);
     $add49 = (($add42) + 1)|0;
     $arrayidx50 = (($p) + ($add49<<2)|0);
     $8 = HEAP32[$arrayidx50>>2]|0;
     $call51 = (_swapc($8,$sub)|0);
     $cmp52 = ($call51>>>0)<($size>>>0);
     $sub55 = (($size) - ($call51))|0;
     $cmp56 = ($call44>>>0)<($sub55>>>0);
     $or$cond67 = $cmp52 & $cmp56;
     if ($or$cond67) {
      $add$ptr65 = (($p) + ($call51)|0);
      $add59 = (($call51) + ($call44))|0;
      $arrayidx60 = (($p) + ($add59)|0);
      $9 = HEAP8[$arrayidx60>>0]|0;
      $tobool62 = ($9<<24>>24)==(0);
      $add$ptr65$ = $tobool62 ? $add$ptr65 : 0;
      $retval$4 = $add$ptr65$;
     } else {
      $retval$4 = 0;
     }
    } else {
     $retval$4 = 0;
    }
   } else {
    $retval$4 = 0;
   }
  } else {
   $retval$4 = 0;
  }
 } while(0);
 return ($retval$4|0);
}
function _swapc($x,$c) {
 $x = $x|0;
 $c = $c|0;
 var $or5 = 0, $tobool = 0, $x$or5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($c|0)==(0);
 $or5 = (_llvm_bswap_i32(($x|0))|0);
 $x$or5 = $tobool ? $x : $or5;
 return ($x$or5|0);
}
function _strcmp($l,$r) {
 $l = $l|0;
 $r = $r|0;
 var $$lcssa = 0, $$lcssa6 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $cmp = 0, $cmp7 = 0, $conv5 = 0, $conv6 = 0, $incdec$ptr = 0, $incdec$ptr4 = 0, $l$addr$010 = 0, $or$cond = 0, $or$cond9 = 0, $r$addr$011 = 0, $sub = 0, $tobool = 0, $tobool8 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[$l>>0]|0;
 $1 = HEAP8[$r>>0]|0;
 $cmp7 = ($0<<24>>24)!=($1<<24>>24);
 $tobool8 = ($0<<24>>24)==(0);
 $or$cond9 = $tobool8 | $cmp7;
 if ($or$cond9) {
  $$lcssa = $1;$$lcssa6 = $0;
 } else {
  $l$addr$010 = $l;$r$addr$011 = $r;
  while(1) {
   $incdec$ptr = ((($l$addr$010)) + 1|0);
   $incdec$ptr4 = ((($r$addr$011)) + 1|0);
   $2 = HEAP8[$incdec$ptr>>0]|0;
   $3 = HEAP8[$incdec$ptr4>>0]|0;
   $cmp = ($2<<24>>24)!=($3<<24>>24);
   $tobool = ($2<<24>>24)==(0);
   $or$cond = $tobool | $cmp;
   if ($or$cond) {
    $$lcssa = $3;$$lcssa6 = $2;
    break;
   } else {
    $l$addr$010 = $incdec$ptr;$r$addr$011 = $incdec$ptr4;
   }
  }
 }
 $conv5 = $$lcssa6&255;
 $conv6 = $$lcssa&255;
 $sub = (($conv5) - ($conv6))|0;
 return ($sub|0);
}
function ___fwritex($s,$l,$f) {
 $s = $s|0;
 $l = $l|0;
 $f = $f|0;
 var $$pre = 0, $$pre33 = 0, $0 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add$ptr = 0, $add$ptr26 = 0, $arrayidx = 0, $call = 0, $call16 = 0, $call4 = 0;
 var $cmp = 0, $cmp11 = 0, $cmp17 = 0, $cmp6 = 0, $i$0 = 0, $i$1 = 0, $l$addr$0 = 0, $l$addr$1 = 0, $lbf = 0, $retval$1 = 0, $s$addr$1 = 0, $sub = 0, $sub$ptr$sub = 0, $tobool = 0, $tobool1 = 0, $tobool9 = 0, $wend = 0, $wpos = 0, $write = 0, $write15 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $wend = ((($f)) + 16|0);
 $0 = HEAP32[$wend>>2]|0;
 $tobool = ($0|0)==(0|0);
 if ($tobool) {
  $call = (___towrite($f)|0);
  $tobool1 = ($call|0)==(0);
  if ($tobool1) {
   $$pre = HEAP32[$wend>>2]|0;
   $3 = $$pre;
   label = 5;
  } else {
   $retval$1 = 0;
  }
 } else {
  $1 = $0;
  $3 = $1;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $wpos = ((($f)) + 20|0);
   $2 = HEAP32[$wpos>>2]|0;
   $sub$ptr$sub = (($3) - ($2))|0;
   $cmp = ($sub$ptr$sub>>>0)<($l>>>0);
   $4 = $2;
   if ($cmp) {
    $write = ((($f)) + 36|0);
    $5 = HEAP32[$write>>2]|0;
    $call4 = (FUNCTION_TABLE_iiii[$5 & 7]($f,$s,$l)|0);
    $retval$1 = $call4;
    break;
   }
   $lbf = ((($f)) + 75|0);
   $6 = HEAP8[$lbf>>0]|0;
   $cmp6 = ($6<<24>>24)>(-1);
   L10: do {
    if ($cmp6) {
     $i$0 = $l;
     while(1) {
      $tobool9 = ($i$0|0)==(0);
      if ($tobool9) {
       $9 = $4;$i$1 = 0;$l$addr$1 = $l;$s$addr$1 = $s;
       break L10;
      }
      $sub = (($i$0) + -1)|0;
      $arrayidx = (($s) + ($sub)|0);
      $7 = HEAP8[$arrayidx>>0]|0;
      $cmp11 = ($7<<24>>24)==(10);
      if ($cmp11) {
       break;
      } else {
       $i$0 = $sub;
      }
     }
     $write15 = ((($f)) + 36|0);
     $8 = HEAP32[$write15>>2]|0;
     $call16 = (FUNCTION_TABLE_iiii[$8 & 7]($f,$s,$i$0)|0);
     $cmp17 = ($call16>>>0)<($i$0>>>0);
     if ($cmp17) {
      $retval$1 = $call16;
      break L5;
     }
     $add$ptr = (($s) + ($i$0)|0);
     $l$addr$0 = (($l) - ($i$0))|0;
     $$pre33 = HEAP32[$wpos>>2]|0;
     $9 = $$pre33;$i$1 = $i$0;$l$addr$1 = $l$addr$0;$s$addr$1 = $add$ptr;
    } else {
     $9 = $4;$i$1 = 0;$l$addr$1 = $l;$s$addr$1 = $s;
    }
   } while(0);
   _memcpy(($9|0),($s$addr$1|0),($l$addr$1|0))|0;
   $10 = HEAP32[$wpos>>2]|0;
   $add$ptr26 = (($10) + ($l$addr$1)|0);
   HEAP32[$wpos>>2] = $add$ptr26;
   $add = (($i$1) + ($l$addr$1))|0;
   $retval$1 = $add;
  }
 } while(0);
 return ($retval$1|0);
}
function ___towrite($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $add$ptr = 0, $and = 0, $buf = 0, $buf_size = 0, $conv = 0, $conv3 = 0, $mode = 0, $or = 0, $or5 = 0, $rend = 0, $retval$0 = 0, $rpos = 0, $sub = 0, $tobool = 0, $wbase = 0, $wend = 0;
 var $wpos = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $mode = ((($f)) + 74|0);
 $0 = HEAP8[$mode>>0]|0;
 $conv = $0 << 24 >> 24;
 $sub = (($conv) + 255)|0;
 $or = $sub | $conv;
 $conv3 = $or&255;
 HEAP8[$mode>>0] = $conv3;
 $1 = HEAP32[$f>>2]|0;
 $and = $1 & 8;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $rend = ((($f)) + 8|0);
  HEAP32[$rend>>2] = 0;
  $rpos = ((($f)) + 4|0);
  HEAP32[$rpos>>2] = 0;
  $buf = ((($f)) + 44|0);
  $2 = HEAP32[$buf>>2]|0;
  $wbase = ((($f)) + 28|0);
  HEAP32[$wbase>>2] = $2;
  $wpos = ((($f)) + 20|0);
  HEAP32[$wpos>>2] = $2;
  $buf_size = ((($f)) + 48|0);
  $3 = HEAP32[$buf_size>>2]|0;
  $add$ptr = (($2) + ($3)|0);
  $wend = ((($f)) + 16|0);
  HEAP32[$wend>>2] = $add$ptr;
  $retval$0 = 0;
 } else {
  $or5 = $1 | 32;
  HEAP32[$f>>2] = $or5;
  $retval$0 = -1;
 }
 return ($retval$0|0);
}
function ___toread($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $add$ptr = 0, $and = 0, $buf = 0, $buf_size = 0, $cmp = 0, $conv = 0, $conv3 = 0, $mode = 0, $or = 0, $or9 = 0, $rend = 0, $retval$0 = 0;
 var $rpos = 0, $sext = 0, $sub = 0, $tobool = 0, $wbase = 0, $wend = 0, $wpos = 0, $write = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $mode = ((($f)) + 74|0);
 $0 = HEAP8[$mode>>0]|0;
 $conv = $0 << 24 >> 24;
 $sub = (($conv) + 255)|0;
 $or = $sub | $conv;
 $conv3 = $or&255;
 HEAP8[$mode>>0] = $conv3;
 $wpos = ((($f)) + 20|0);
 $1 = HEAP32[$wpos>>2]|0;
 $wbase = ((($f)) + 28|0);
 $2 = HEAP32[$wbase>>2]|0;
 $cmp = ($1>>>0)>($2>>>0);
 if ($cmp) {
  $write = ((($f)) + 36|0);
  $3 = HEAP32[$write>>2]|0;
  (FUNCTION_TABLE_iiii[$3 & 7]($f,0,0)|0);
 }
 $wend = ((($f)) + 16|0);
 HEAP32[$wend>>2] = 0;
 HEAP32[$wbase>>2] = 0;
 HEAP32[$wpos>>2] = 0;
 $4 = HEAP32[$f>>2]|0;
 $and = $4 & 4;
 $tobool = ($and|0)==(0);
 if ($tobool) {
  $buf = ((($f)) + 44|0);
  $5 = HEAP32[$buf>>2]|0;
  $buf_size = ((($f)) + 48|0);
  $6 = HEAP32[$buf_size>>2]|0;
  $add$ptr = (($5) + ($6)|0);
  $rend = ((($f)) + 8|0);
  HEAP32[$rend>>2] = $add$ptr;
  $rpos = ((($f)) + 4|0);
  HEAP32[$rpos>>2] = $add$ptr;
  $7 = $4 << 27;
  $sext = $7 >> 31;
  $retval$0 = $sext;
 } else {
  $or9 = $4 | 32;
  HEAP32[$f>>2] = $or9;
  $retval$0 = -1;
 }
 return ($retval$0|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((4292|0));
 return (4300|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((4292|0));
 return;
}
function _fflush($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $call = 0, $call1 = 0, $call11 = 0, $call118 = 0, $call17 = 0, $call23 = 0, $call7 = 0, $cmp = 0, $cmp15 = 0, $cmp21 = 0, $cond10 = 0, $cond20 = 0, $f$addr$0 = 0, $f$addr$019 = 0;
 var $f$addr$022 = 0, $lock = 0, $lock14 = 0, $next = 0, $or = 0, $phitmp = 0, $r$0$lcssa = 0, $r$021 = 0, $r$1 = 0, $retval$0 = 0, $tobool = 0, $tobool12 = 0, $tobool1220 = 0, $tobool25 = 0, $tobool5 = 0, $wbase = 0, $wpos = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($f|0)==(0|0);
 do {
  if ($tobool) {
   $1 = HEAP32[98]|0;
   $tobool5 = ($1|0)==(0|0);
   if ($tobool5) {
    $cond10 = 0;
   } else {
    $2 = HEAP32[98]|0;
    $call7 = (_fflush($2)|0);
    $cond10 = $call7;
   }
   $call11 = (___ofl_lock()|0);
   $f$addr$019 = HEAP32[$call11>>2]|0;
   $tobool1220 = ($f$addr$019|0)==(0|0);
   if ($tobool1220) {
    $r$0$lcssa = $cond10;
   } else {
    $f$addr$022 = $f$addr$019;$r$021 = $cond10;
    while(1) {
     $lock14 = ((($f$addr$022)) + 76|0);
     $3 = HEAP32[$lock14>>2]|0;
     $cmp15 = ($3|0)>(-1);
     if ($cmp15) {
      $call17 = (___lockfile($f$addr$022)|0);
      $cond20 = $call17;
     } else {
      $cond20 = 0;
     }
     $wpos = ((($f$addr$022)) + 20|0);
     $4 = HEAP32[$wpos>>2]|0;
     $wbase = ((($f$addr$022)) + 28|0);
     $5 = HEAP32[$wbase>>2]|0;
     $cmp21 = ($4>>>0)>($5>>>0);
     if ($cmp21) {
      $call23 = (___fflush_unlocked($f$addr$022)|0);
      $or = $call23 | $r$021;
      $r$1 = $or;
     } else {
      $r$1 = $r$021;
     }
     $tobool25 = ($cond20|0)==(0);
     if (!($tobool25)) {
      ___unlockfile($f$addr$022);
     }
     $next = ((($f$addr$022)) + 56|0);
     $f$addr$0 = HEAP32[$next>>2]|0;
     $tobool12 = ($f$addr$0|0)==(0|0);
     if ($tobool12) {
      $r$0$lcssa = $r$1;
      break;
     } else {
      $f$addr$022 = $f$addr$0;$r$021 = $r$1;
     }
    }
   }
   ___ofl_unlock();
   $retval$0 = $r$0$lcssa;
  } else {
   $lock = ((($f)) + 76|0);
   $0 = HEAP32[$lock>>2]|0;
   $cmp = ($0|0)>(-1);
   if (!($cmp)) {
    $call118 = (___fflush_unlocked($f)|0);
    $retval$0 = $call118;
    break;
   }
   $call = (___lockfile($f)|0);
   $phitmp = ($call|0)==(0);
   $call1 = (___fflush_unlocked($f)|0);
   if ($phitmp) {
    $retval$0 = $call1;
   } else {
    ___unlockfile($f);
    $retval$0 = $call1;
   }
  }
 } while(0);
 return ($retval$0|0);
}
function ___fflush_unlocked($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $cmp = 0, $cmp4 = 0, $rend = 0, $retval$0 = 0, $rpos = 0, $seek = 0, $sub$ptr$lhs$cast = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$sub = 0, $tobool = 0, $wbase = 0, $wend = 0, $wpos = 0;
 var $write = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $wpos = ((($f)) + 20|0);
 $0 = HEAP32[$wpos>>2]|0;
 $wbase = ((($f)) + 28|0);
 $1 = HEAP32[$wbase>>2]|0;
 $cmp = ($0>>>0)>($1>>>0);
 if ($cmp) {
  $write = ((($f)) + 36|0);
  $2 = HEAP32[$write>>2]|0;
  (FUNCTION_TABLE_iiii[$2 & 7]($f,0,0)|0);
  $3 = HEAP32[$wpos>>2]|0;
  $tobool = ($3|0)==(0|0);
  if ($tobool) {
   $retval$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $rpos = ((($f)) + 4|0);
  $4 = HEAP32[$rpos>>2]|0;
  $rend = ((($f)) + 8|0);
  $5 = HEAP32[$rend>>2]|0;
  $cmp4 = ($4>>>0)<($5>>>0);
  if ($cmp4) {
   $sub$ptr$lhs$cast = $4;
   $sub$ptr$rhs$cast = $5;
   $sub$ptr$sub = (($sub$ptr$lhs$cast) - ($sub$ptr$rhs$cast))|0;
   $seek = ((($f)) + 40|0);
   $6 = HEAP32[$seek>>2]|0;
   (FUNCTION_TABLE_iiii[$6 & 7]($f,$sub$ptr$sub,1)|0);
  }
  $wend = ((($f)) + 16|0);
  HEAP32[$wend>>2] = 0;
  HEAP32[$wbase>>2] = 0;
  HEAP32[$wpos>>2] = 0;
  HEAP32[$rend>>2] = 0;
  HEAP32[$rpos>>2] = 0;
  $retval$0 = 0;
 }
 return ($retval$0|0);
}
function _mbrtowc($wc,$src,$n,$st) {
 $wc = $wc|0;
 $src = $src|0;
 $n = $n|0;
 $st = $st|0;
 var $$st = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $and = 0, $arrayidx38 = 0, $c$036 = 0, $c$1 = 0, $c$2 = 0, $call = 0, $call71 = 0, $cmp = 0;
 var $cmp32 = 0, $cmp65 = 0, $conv = 0, $conv29 = 0, $conv31 = 0, $conv42 = 0, $conv52 = 0, $dec = 0, $dec55 = 0, $dummy = 0, $dummy$wc = 0, $incdec$ptr = 0, $incdec$ptr51 = 0, $lnot$ext = 0, $locale = 0, $n$addr$035 = 0, $n$addr$1 = 0, $not$tobool21 = 0, $or = 0, $or54 = 0;
 var $retval$0 = 0, $s$037 = 0, $s$1 = 0, $shl = 0, $shr32 = 0, $shr46 = 0, $sub = 0, $sub43 = 0, $sub53 = 0, $sub59 = 0, $tobool = 0, $tobool1 = 0, $tobool10 = 0, $tobool13 = 0, $tobool18 = 0, $tobool3 = 0, $tobool40 = 0, $tobool48 = 0, $tobool57 = 0, $tobool6 = 0;
 var $tobool61 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $dummy = sp;
 $tobool = ($st|0)==(0|0);
 $$st = $tobool ? 4304 : $st;
 $0 = HEAP32[$$st>>2]|0;
 $tobool1 = ($src|0)==(0|0);
 L1: do {
  if ($tobool1) {
   $tobool3 = ($0|0)==(0);
   if ($tobool3) {
    $retval$0 = 0;
   } else {
    label = 17;
   }
  } else {
   $tobool6 = ($wc|0)==(0|0);
   $dummy$wc = $tobool6 ? $dummy : $wc;
   $tobool10 = ($n|0)==(0);
   if ($tobool10) {
    $retval$0 = -2;
   } else {
    $tobool13 = ($0|0)==(0);
    if ($tobool13) {
     $1 = HEAP8[$src>>0]|0;
     $cmp = ($1<<24>>24)>(-1);
     if ($cmp) {
      $conv = $1&255;
      HEAP32[$dummy$wc>>2] = $conv;
      $tobool18 = ($1<<24>>24)!=(0);
      $lnot$ext = $tobool18&1;
      $retval$0 = $lnot$ext;
      break;
     }
     $call = (___pthread_self_544()|0);
     $locale = ((($call)) + 188|0);
     $2 = HEAP32[$locale>>2]|0;
     $3 = HEAP32[$2>>2]|0;
     $not$tobool21 = ($3|0)==(0|0);
     $4 = HEAP8[$src>>0]|0;
     if ($not$tobool21) {
      $conv29 = $4 << 24 >> 24;
      $and = $conv29 & 57343;
      HEAP32[$dummy$wc>>2] = $and;
      $retval$0 = 1;
      break;
     }
     $conv31 = $4&255;
     $sub = (($conv31) + -194)|0;
     $cmp32 = ($sub>>>0)>(50);
     if ($cmp32) {
      label = 17;
      break;
     }
     $incdec$ptr = ((($src)) + 1|0);
     $arrayidx38 = (396 + ($sub<<2)|0);
     $5 = HEAP32[$arrayidx38>>2]|0;
     $dec = (($n) + -1)|0;
     $tobool40 = ($dec|0)==(0);
     if ($tobool40) {
      $c$2 = $5;
     } else {
      $c$036 = $5;$n$addr$035 = $dec;$s$037 = $incdec$ptr;
      label = 11;
     }
    } else {
     $c$036 = $0;$n$addr$035 = $n;$s$037 = $src;
     label = 11;
    }
    L14: do {
     if ((label|0) == 11) {
      $6 = HEAP8[$s$037>>0]|0;
      $conv42 = $6&255;
      $shr32 = $conv42 >>> 3;
      $sub43 = (($shr32) + -16)|0;
      $shr46 = $c$036 >> 26;
      $add = (($shr32) + ($shr46))|0;
      $or = $sub43 | $add;
      $tobool48 = ($or>>>0)>(7);
      if ($tobool48) {
       label = 17;
       break L1;
      } else {
       $7 = $6;$c$1 = $c$036;$n$addr$1 = $n$addr$035;$s$1 = $s$037;
      }
      while(1) {
       $shl = $c$1 << 6;
       $incdec$ptr51 = ((($s$1)) + 1|0);
       $conv52 = $7&255;
       $sub53 = (($conv52) + -128)|0;
       $or54 = $sub53 | $shl;
       $dec55 = (($n$addr$1) + -1)|0;
       $tobool57 = ($or54|0)<(0);
       if (!($tobool57)) {
        break;
       }
       $tobool61 = ($dec55|0)==(0);
       if ($tobool61) {
        $c$2 = $or54;
        break L14;
       }
       $8 = HEAP8[$incdec$ptr51>>0]|0;
       $9 = $8 & -64;
       $cmp65 = ($9<<24>>24)==(-128);
       if ($cmp65) {
        $7 = $8;$c$1 = $or54;$n$addr$1 = $dec55;$s$1 = $incdec$ptr51;
       } else {
        label = 17;
        break L1;
       }
      }
      HEAP32[$$st>>2] = 0;
      HEAP32[$dummy$wc>>2] = $or54;
      $sub59 = (($n) - ($dec55))|0;
      $retval$0 = $sub59;
      break L1;
     }
    } while(0);
    HEAP32[$$st>>2] = $c$2;
    $retval$0 = -2;
   }
  }
 } while(0);
 if ((label|0) == 17) {
  HEAP32[$$st>>2] = 0;
  $call71 = (___errno_location()|0);
  HEAP32[$call71>>2] = 84;
  $retval$0 = -1;
 }
 STACKTOP = sp;return ($retval$0|0);
}
function ___pthread_self_544() {
 var $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (_pthread_self()|0);
 return ($call|0);
}
function ___uflow($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $c = 0, $call = 0, $call1 = 0, $cmp = 0, $conv = 0, $read = 0, $retval$0 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $c = sp;
 $call = (___toread($f)|0);
 $tobool = ($call|0)==(0);
 if ($tobool) {
  $read = ((($f)) + 32|0);
  $0 = HEAP32[$read>>2]|0;
  $call1 = (FUNCTION_TABLE_iiii[$0 & 7]($f,$c,1)|0);
  $cmp = ($call1|0)==(1);
  if ($cmp) {
   $1 = HEAP8[$c>>0]|0;
   $conv = $1&255;
   $retval$0 = $conv;
  } else {
   $retval$0 = -1;
  }
 } else {
  $retval$0 = -1;
 }
 STACKTOP = sp;return ($retval$0|0);
}
function _printf($fmt,$varargs) {
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $0 = 0, $ap = 0, $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 $0 = HEAP32[66]|0;
 $call = (_vfprintf($0,$fmt,$ap)|0);
 STACKTOP = sp;return ($call|0);
}
function _mbsinit($st) {
 $st = $st|0;
 var $0 = 0, $1 = 0, $lnot = 0, $lor$ext = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($st|0)==(0|0);
 if ($tobool) {
  $1 = 1;
 } else {
  $0 = HEAP32[$st>>2]|0;
  $lnot = ($0|0)==(0);
  $1 = $lnot;
 }
 $lor$ext = $1&1;
 return ($lor$ext|0);
}
function _vfscanf($f,$fmt,$ap) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $$ = 0, $$224 = 0, $$225 = 0, $$compoundliteral$sroa$2$0$$sroa_idx8 = 0, $$compoundliteral329 = 0, $$lcssa = 0, $$ph = 0, $$ph245 = 0, $$pre = 0, $$pre385 = 0, $$pre386 = 0, $$pre388 = 0, $$pre389 = 0, $$pre390 = 0, $$pre391 = 0, $$pre392 = 0, $$s$0 = 0, $$size$0 = 0, $$width$0 = 0, $0 = 0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $add = 0, $add$ptr = 0, $add$ptr86 = 0, $add173 = 0, $add174 = 0, $add278 = 0, $add287 = 0, $add29 = 0, $add296 = 0, $add325 = 0, $add346 = 0, $add378 = 0, $add389 = 0, $add417 = 0, $add439 = 0;
 var $add460 = 0, $add548 = 0, $add549 = 0, $add96 = 0, $alloc$1 = 0, $alloc$2 = 0, $and = 0, $arglist_current = 0, $arglist_next = 0, $arrayidx = 0, $arrayidx210 = 0, $arrayidx215 = 0, $arrayidx235 = 0, $arrayidx244 = 0, $arrayidx244$sink = 0, $arrayidx259 = 0, $arrayidx269 = 0, $arrayidx279 = 0, $arrayidx288 = 0, $arrayidx326 = 0;
 var $arrayidx33 = 0, $arrayidx338 = 0, $arrayidx379 = 0, $arrayidx384 = 0, $arrayidx418 = 0, $arrayidx423 = 0, $arrayidx440 = 0, $arrayidx491 = 0, $arrayidx495 = 0, $arrayidx79 = 0, $base$0 = 0, $c$0308 = 0, $call = 0, $call1 = 0, $call14 = 0, $call153 = 0, $call156 = 0, $call17 = 0, $call185 = 0, $call306 = 0;
 var $call322 = 0, $call331 = 0, $call348 = 0, $call354 = 0, $call361 = 0, $call375 = 0, $call392 = 0, $call4 = 0, $call414 = 0, $call436 = 0, $call50 = 0, $call522 = 0.0, $call85 = 0, $cmp = 0, $cmp100 = 0, $cmp111 = 0, $cmp119 = 0, $cmp131 = 0, $cmp146 = 0, $cmp178 = 0;
 var $cmp188 = 0, $cmp200 = 0, $cmp200$not = 0, $cmp203 = 0, $cmp220 = 0, $cmp273 = 0, $cmp273307 = 0, $cmp300 = 0, $cmp31 = 0, $cmp315 = 0, $cmp342 = 0, $cmp368 = 0, $cmp385 = 0, $cmp407 = 0, $cmp429 = 0, $cmp43 = 0, $cmp474 = 0, $cmp513 = 0, $cmp54 = 0, $cmp64 = 0;
 var $cmp7 = 0, $cmp81 = 0, $cond = 0, $cond155 = 0, $cond16 = 0, $cond299 = 0, $cond324 = 0, $cond377 = 0, $cond416 = 0, $cond438 = 0, $cond52 = 0, $conv = 0, $conv12 = 0, $conv130 = 0, $conv151 = 0, $conv243 = 0, $conv270 = 0, $conv272 = 0, $conv285$pre$phiZ2D = 0, $conv286 = 0;
 var $conv3 = 0, $conv320 = 0, $conv330 = 0, $conv34 = 0, $conv373 = 0, $conv382 = 0, $conv40 = 0, $conv412 = 0, $conv421 = 0, $conv434 = 0, $conv48 = 0, $conv53 = 0, $conv536 = 0.0, $conv91 = 0, $conv91298 = 0, $conv91303 = 0, $dest$0 = 0, $expanded = 0, $expanded1 = 0, $expanded3 = 0;
 var $expanded4 = 0, $expanded5 = 0, $factor = 0, $factor232 = 0, $i$0$ph = 0, $i$0$ph$phi = 0, $i$0$ph236 = 0, $i$1 = 0, $i$2 = 0, $i$2$ph = 0, $i$2$ph$phi = 0, $i$3 = 0, $i$4 = 0, $inc = 0, $inc337 = 0, $inc383 = 0, $inc422 = 0, $inc552 = 0, $incdec$ptr105 = 0, $incdec$ptr105$p$3 = 0;
 var $incdec$ptr108 = 0, $incdec$ptr11 = 0, $incdec$ptr114 = 0, $incdec$ptr114$incdec$ptr108 = 0, $incdec$ptr122 = 0, $incdec$ptr122$incdec$ptr108 = 0, $incdec$ptr150 = 0, $incdec$ptr164 = 0, $incdec$ptr182 = 0, $incdec$ptr196 = 0, $incdec$ptr218 = 0, $incdec$ptr223 = 0, $incdec$ptr241 = 0, $incdec$ptr25 = 0, $incdec$ptr290 = 0, $incdec$ptr319 = 0, $incdec$ptr372 = 0, $incdec$ptr411 = 0, $incdec$ptr433 = 0, $incdec$ptr451 = 0;
 var $incdec$ptr47 = 0, $incdec$ptr555 = 0, $incdec$ptr61 = 0, $incdec$ptr75 = 0, $incdec$ptr98 = 0, $invert$0 = 0, $isdigit = 0, $isdigit220 = 0, $isdigit220300 = 0, $isdigittmp = 0, $isdigittmp219 = 0, $isdigittmp219299 = 0, $k$0$ph = 0, $k$1$ph = 0, $lnot$ext$$le324 = 0, $lnot$ext$$le326 = 0, $lock = 0, $matches$0$inc552 = 0, $matches$0312 = 0, $matches$1 = 0;
 var $matches$2 = 0, $matches$3 = 0, $mul = 0, $mul305 = 0, $mul347 = 0, $narrow = 0, $narrow350 = 0, $or = 0, $or$cond = 0, $or$cond1 = 0, $or$cond2 = 0, $or$cond223 = 0, $or$conv130 = 0, $p$0316 = 0, $p$1 = 0, $p$10 = 0, $p$11 = 0, $p$2 = 0, $p$3$lcssa = 0, $p$3301 = 0;
 var $p$5 = 0, $p$6 = 0, $p$7 = 0, $p$7$ph = 0, $p$8 = 0, $p$9 = 0, $pos$0315 = 0, $pos$1 = 0, $pos$2 = 0, $rend169 = 0, $rpos144 = 0, $s$0310 = 0, $s$2$ph = 0, $s$4 = 0, $s$5 = 0, $s$6 = 0, $s$7 = 0, $s$8 = 0, $s$9 = 0, $s$9$ph = 0;
 var $scanset = 0, $shcnt167 = 0, $shend145 = 0, $size$0 = 0, $st = 0, $sub$ptr$sub = 0, $sub$ptr$sub172 = 0, $sub$ptr$sub459 = 0, $sub$ptr$sub508222 = 0, $sub$ptr$sub528221 = 0, $sub$ptr$sub547 = 0, $sub242 = 0, $sub97 = 0, $tobool = 0, $tobool103 = 0, $tobool157 = 0, $tobool161 = 0, $tobool18 = 0, $tobool193 = 0, $tobool2 = 0;
 var $tobool22 = 0, $tobool307 = 0, $tobool309 = 0, $tobool327 = 0, $tobool335 = 0, $tobool349 = 0, $tobool355 = 0, $tobool362 = 0, $tobool380 = 0, $tobool393 = 0, $tobool402 = 0, $tobool419 = 0, $tobool441 = 0, $tobool448 = 0, $tobool461 = 0, $tobool489 = 0, $tobool493 = 0, $tobool5 = 0, $tobool510 = 0, $tobool530 = 0;
 var $tobool533 = 0, $tobool558 = 0, $tobool558$old = 0, $tobool561 = 0, $tobool565 = 0, $tobool58 = 0, $trunc = 0, $wc = 0, $wcs$5 = 0, $width$0$lcssa = 0, $width$0302 = 0, $width$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 288|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(288|0);
 $st = sp + 8|0;
 $scanset = sp + 17|0;
 $wc = sp;
 $$compoundliteral329 = sp + 16|0;
 $lock = ((($f)) + 76|0);
 $0 = HEAP32[$lock>>2]|0;
 $cmp = ($0|0)>(-1);
 if ($cmp) {
  $call = (___lockfile($f)|0);
  $cond = $call;
 } else {
  $cond = 0;
 }
 $1 = HEAP8[$fmt>>0]|0;
 $tobool309 = ($1<<24>>24)==(0);
 L4: do {
  if ($tobool309) {
   $matches$3 = 0;
  } else {
   $rpos144 = ((($f)) + 4|0);
   $shend145 = ((($f)) + 100|0);
   $shcnt167 = ((($f)) + 108|0);
   $rend169 = ((($f)) + 8|0);
   $arrayidx210 = ((($scanset)) + 10|0);
   $arrayidx215 = ((($scanset)) + 33|0);
   $$compoundliteral$sroa$2$0$$sroa_idx8 = ((($st)) + 4|0);
   $arrayidx235 = ((($scanset)) + 46|0);
   $arrayidx244 = ((($scanset)) + 94|0);
   $2 = ((($scanset)) + 1|0);
   $3 = ((($scanset)) + 1|0);
   $32 = 0;$4 = $1;$matches$0312 = 0;$p$0316 = $fmt;$pos$0315 = 0;$s$0310 = 0;
   L6: while(1) {
    $conv = $4&255;
    $call1 = (_isspace($conv)|0);
    $tobool2 = ($call1|0)==(0);
    L8: do {
     if ($tobool2) {
      $cmp31 = ($4<<24>>24)==(37);
      L10: do {
       if ($cmp31) {
        $arrayidx33 = ((($p$0316)) + 1|0);
        $15 = HEAP8[$arrayidx33>>0]|0;
        L12: do {
         switch ($15<<24>>24) {
         case 37:  {
          break L10;
          break;
         }
         case 42:  {
          $incdec$ptr75 = ((($p$0316)) + 2|0);
          $dest$0 = 0;$p$2 = $incdec$ptr75;
          break;
         }
         default: {
          $conv34 = $15&255;
          $isdigittmp = (($conv34) + -48)|0;
          $isdigit = ($isdigittmp>>>0)<(10);
          if ($isdigit) {
           $arrayidx79 = ((($p$0316)) + 2|0);
           $22 = HEAP8[$arrayidx79>>0]|0;
           $cmp81 = ($22<<24>>24)==(36);
           if ($cmp81) {
            $call85 = (_arg_n($ap,$isdigittmp)|0);
            $add$ptr86 = ((($p$0316)) + 3|0);
            $dest$0 = $call85;$p$2 = $add$ptr86;
            break L12;
           }
          }
          $arglist_current = HEAP32[$ap>>2]|0;
          $23 = $arglist_current;
          $24 = ((0) + 4|0);
          $expanded1 = $24;
          $expanded = (($expanded1) - 1)|0;
          $25 = (($23) + ($expanded))|0;
          $26 = ((0) + 4|0);
          $expanded5 = $26;
          $expanded4 = (($expanded5) - 1)|0;
          $expanded3 = $expanded4 ^ -1;
          $27 = $25 & $expanded3;
          $28 = $27;
          $29 = HEAP32[$28>>2]|0;
          $arglist_next = ((($28)) + 4|0);
          HEAP32[$ap>>2] = $arglist_next;
          $dest$0 = $29;$p$2 = $arrayidx33;
         }
         }
        } while(0);
        $30 = HEAP8[$p$2>>0]|0;
        $conv91298 = $30&255;
        $isdigittmp219299 = (($conv91298) + -48)|0;
        $isdigit220300 = ($isdigittmp219299>>>0)<(10);
        if ($isdigit220300) {
         $conv91303 = $conv91298;$p$3301 = $p$2;$width$0302 = 0;
         while(1) {
          $mul = ($width$0302*10)|0;
          $add96 = (($mul) + -48)|0;
          $sub97 = (($add96) + ($conv91303))|0;
          $incdec$ptr98 = ((($p$3301)) + 1|0);
          $31 = HEAP8[$incdec$ptr98>>0]|0;
          $conv91 = $31&255;
          $isdigittmp219 = (($conv91) + -48)|0;
          $isdigit220 = ($isdigittmp219>>>0)<(10);
          if ($isdigit220) {
           $conv91303 = $conv91;$p$3301 = $incdec$ptr98;$width$0302 = $sub97;
          } else {
           $$lcssa = $31;$p$3$lcssa = $incdec$ptr98;$width$0$lcssa = $sub97;
           break;
          }
         }
        } else {
         $$lcssa = $30;$p$3$lcssa = $p$2;$width$0$lcssa = 0;
        }
        $cmp100 = ($$lcssa<<24>>24)==(109);
        $tobool103 = ($dest$0|0)!=(0|0);
        $incdec$ptr105 = ((($p$3$lcssa)) + 1|0);
        $$s$0 = $cmp100 ? 0 : $s$0310;
        $$ = $cmp100 ? 0 : $32;
        $incdec$ptr105$p$3 = $cmp100 ? $incdec$ptr105 : $p$3$lcssa;
        $narrow = $tobool103 & $cmp100;
        $incdec$ptr108 = ((($incdec$ptr105$p$3)) + 1|0);
        $33 = HEAP8[$incdec$ptr105$p$3>>0]|0;
        switch ($33<<24>>24) {
        case 104:  {
         $34 = HEAP8[$incdec$ptr108>>0]|0;
         $cmp111 = ($34<<24>>24)==(104);
         $incdec$ptr114 = ((($incdec$ptr105$p$3)) + 2|0);
         $incdec$ptr114$incdec$ptr108 = $cmp111 ? $incdec$ptr114 : $incdec$ptr108;
         $$224 = $cmp111 ? -2 : -1;
         $p$5 = $incdec$ptr114$incdec$ptr108;$size$0 = $$224;
         break;
        }
        case 108:  {
         $35 = HEAP8[$incdec$ptr108>>0]|0;
         $cmp119 = ($35<<24>>24)==(108);
         $incdec$ptr122 = ((($incdec$ptr105$p$3)) + 2|0);
         $incdec$ptr122$incdec$ptr108 = $cmp119 ? $incdec$ptr122 : $incdec$ptr108;
         $$225 = $cmp119 ? 3 : 1;
         $p$5 = $incdec$ptr122$incdec$ptr108;$size$0 = $$225;
         break;
        }
        case 106:  {
         $p$5 = $incdec$ptr108;$size$0 = 3;
         break;
        }
        case 116: case 122:  {
         $p$5 = $incdec$ptr108;$size$0 = 1;
         break;
        }
        case 76:  {
         $p$5 = $incdec$ptr108;$size$0 = 2;
         break;
        }
        case 110: case 112: case 67: case 83: case 91: case 99: case 115: case 88: case 71: case 70: case 69: case 65: case 103: case 102: case 101: case 97: case 120: case 117: case 111: case 105: case 100:  {
         $p$5 = $incdec$ptr105$p$3;$size$0 = 0;
         break;
        }
        default: {
         $102 = $$;$narrow350 = $narrow;$s$7 = $$s$0;
         label = 137;
         break L6;
        }
        }
        $36 = HEAP8[$p$5>>0]|0;
        $conv130 = $36&255;
        $and = $conv130 & 47;
        $cmp131 = ($and|0)==(3);
        $or = $conv130 | 32;
        $or$conv130 = $cmp131 ? $or : $conv130;
        $$size$0 = $cmp131 ? 1 : $size$0;
        $trunc = $or$conv130&255;
        switch ($trunc<<24>>24) {
        case 99:  {
         $37 = ($width$0$lcssa|0)>(1);
         $$width$0 = $37 ? $width$0$lcssa : 1;
         $pos$1 = $pos$0315;$width$1 = $$width$0;
         break;
        }
        case 91:  {
         $pos$1 = $pos$0315;$width$1 = $width$0$lcssa;
         break;
        }
        case 110:  {
         $38 = ($pos$0315|0)<(0);
         $39 = $38 << 31 >> 31;
         _store_int($dest$0,$$size$0,$pos$0315,$39);
         $100 = $$;$matches$1 = $matches$0312;$p$11 = $p$5;$pos$2 = $pos$0315;$s$6 = $$s$0;
         break L8;
         break;
        }
        default: {
         ___shlim($f,0);
         while(1) {
          $40 = HEAP32[$rpos144>>2]|0;
          $41 = HEAP32[$shend145>>2]|0;
          $cmp146 = ($40>>>0)<($41>>>0);
          if ($cmp146) {
           $incdec$ptr150 = ((($40)) + 1|0);
           HEAP32[$rpos144>>2] = $incdec$ptr150;
           $42 = HEAP8[$40>>0]|0;
           $conv151 = $42&255;
           $cond155 = $conv151;
          } else {
           $call153 = (___shgetc($f)|0);
           $cond155 = $call153;
          }
          $call156 = (_isspace($cond155)|0);
          $tobool157 = ($call156|0)==(0);
          if ($tobool157) {
           break;
          }
         }
         $43 = HEAP32[$shend145>>2]|0;
         $tobool161 = ($43|0)==(0|0);
         if ($tobool161) {
          $$pre385 = HEAP32[$rpos144>>2]|0;
          $48 = $$pre385;
         } else {
          $44 = HEAP32[$rpos144>>2]|0;
          $incdec$ptr164 = ((($44)) + -1|0);
          HEAP32[$rpos144>>2] = $incdec$ptr164;
          $45 = $incdec$ptr164;
          $48 = $45;
         }
         $46 = HEAP32[$shcnt167>>2]|0;
         $47 = HEAP32[$rend169>>2]|0;
         $sub$ptr$sub172 = (($46) + ($pos$0315))|0;
         $add173 = (($sub$ptr$sub172) + ($48))|0;
         $add174 = (($add173) - ($47))|0;
         $pos$1 = $add174;$width$1 = $width$0$lcssa;
        }
        }
        ___shlim($f,$width$1);
        $49 = HEAP32[$rpos144>>2]|0;
        $50 = HEAP32[$shend145>>2]|0;
        $cmp178 = ($49>>>0)<($50>>>0);
        if ($cmp178) {
         $incdec$ptr182 = ((($49)) + 1|0);
         HEAP32[$rpos144>>2] = $incdec$ptr182;
         $51 = $50;
        } else {
         $call185 = (___shgetc($f)|0);
         $cmp188 = ($call185|0)<(0);
         if ($cmp188) {
          $102 = $$;$narrow350 = $narrow;$s$7 = $$s$0;
          label = 137;
          break L6;
         }
         $$pre386 = HEAP32[$shend145>>2]|0;
         $51 = $$pre386;
        }
        $tobool193 = ($51|0)==(0|0);
        if (!($tobool193)) {
         $52 = HEAP32[$rpos144>>2]|0;
         $incdec$ptr196 = ((($52)) + -1|0);
         HEAP32[$rpos144>>2] = $incdec$ptr196;
        }
        L55: do {
         switch ($trunc<<24>>24) {
         case 91: case 99: case 115:  {
          $cmp200 = ($or$conv130|0)==(99);
          $53 = $or$conv130 | 16;
          $54 = ($53|0)==(115);
          L57: do {
           if ($54) {
            $cmp203 = ($or$conv130|0)==(115);
            _memset(($2|0),-1,256)|0;
            HEAP8[$scanset>>0] = 0;
            if ($cmp203) {
             HEAP8[$arrayidx215>>0] = 0;
             ;HEAP8[$arrayidx210>>0]=0|0;HEAP8[$arrayidx210+1>>0]=0|0;HEAP8[$arrayidx210+2>>0]=0|0;HEAP8[$arrayidx210+3>>0]=0|0;HEAP8[$arrayidx210+4>>0]=0|0;
             $p$9 = $p$5;
            } else {
             $p$9 = $p$5;
            }
           } else {
            $incdec$ptr218 = ((($p$5)) + 1|0);
            $55 = HEAP8[$incdec$ptr218>>0]|0;
            $cmp220 = ($55<<24>>24)==(94);
            $incdec$ptr223 = ((($p$5)) + 2|0);
            $invert$0 = $cmp220&1;
            $p$6 = $cmp220 ? $incdec$ptr223 : $incdec$ptr218;
            $56 = $cmp220&1;
            _memset(($3|0),($56|0),256)|0;
            HEAP8[$scanset>>0] = 0;
            $57 = HEAP8[$p$6>>0]|0;
            switch ($57<<24>>24) {
            case 45:  {
             $arrayidx244$sink = $arrayidx235;
             label = 64;
             break;
            }
            case 93:  {
             $arrayidx244$sink = $arrayidx244;
             label = 64;
             break;
            }
            default: {
             $$pre391 = $invert$0 ^ 1;
             $$pre392 = $$pre391&255;
             $conv285$pre$phiZ2D = $$pre392;$p$7$ph = $p$6;
            }
            }
            if ((label|0) == 64) {
             label = 0;
             $incdec$ptr241 = ((($p$6)) + 1|0);
             $sub242 = $invert$0 ^ 1;
             $conv243 = $sub242&255;
             HEAP8[$arrayidx244$sink>>0] = $conv243;
             $conv285$pre$phiZ2D = $conv243;$p$7$ph = $incdec$ptr241;
            }
            $p$7 = $p$7$ph;
            while(1) {
             $58 = HEAP8[$p$7>>0]|0;
             L69: do {
              switch ($58<<24>>24) {
              case 0:  {
               $102 = $$;$narrow350 = $narrow;$s$7 = $$s$0;
               label = 137;
               break L6;
               break;
              }
              case 93:  {
               $p$9 = $p$7;
               break L57;
               break;
              }
              case 45:  {
               $arrayidx259 = ((($p$7)) + 1|0);
               $59 = HEAP8[$arrayidx259>>0]|0;
               switch ($59<<24>>24) {
               case 93: case 0:  {
                $62 = 45;$p$8 = $p$7;
                break L69;
                break;
               }
               default: {
               }
               }
               $arrayidx269 = ((($p$7)) + -1|0);
               $60 = HEAP8[$arrayidx269>>0]|0;
               $cmp273307 = ($60&255)<($59&255);
               if ($cmp273307) {
                $conv270 = $60&255;
                $c$0308 = $conv270;
                while(1) {
                 $add278 = (($c$0308) + 1)|0;
                 $arrayidx279 = (($scanset) + ($add278)|0);
                 HEAP8[$arrayidx279>>0] = $conv285$pre$phiZ2D;
                 $61 = HEAP8[$arrayidx259>>0]|0;
                 $conv272 = $61&255;
                 $cmp273 = ($add278|0)<($conv272|0);
                 if ($cmp273) {
                  $c$0308 = $add278;
                 } else {
                  $62 = $61;$p$8 = $arrayidx259;
                  break;
                 }
                }
               } else {
                $62 = $59;$p$8 = $arrayidx259;
               }
               break;
              }
              default: {
               $62 = $58;$p$8 = $p$7;
              }
              }
             } while(0);
             $conv286 = $62&255;
             $add287 = (($conv286) + 1)|0;
             $arrayidx288 = (($scanset) + ($add287)|0);
             HEAP8[$arrayidx288>>0] = $conv285$pre$phiZ2D;
             $incdec$ptr290 = ((($p$8)) + 1|0);
             $p$7 = $incdec$ptr290;
            }
           }
          } while(0);
          $add296 = (($width$1) + 1)|0;
          $cond299 = $cmp200 ? $add296 : 31;
          $cmp300 = ($$size$0|0)==(1);
          L77: do {
           if ($cmp300) {
            if ($narrow) {
             $mul305 = $cond299 << 2;
             $call306 = (_malloc($mul305)|0);
             $tobool307 = ($call306|0)==(0|0);
             if ($tobool307) {
              $102 = 0;$narrow350 = 1;$s$7 = 0;
              label = 137;
              break L6;
             } else {
              $104 = $call306;
             }
            } else {
             $104 = $dest$0;
            }
            HEAP32[$st>>2] = 0;
            HEAP32[$$compoundliteral$sroa$2$0$$sroa_idx8>>2] = 0;
            $$ph = $104;$i$0$ph = 0;$k$0$ph = $cond299;
            L82: while(1) {
             $tobool335 = ($$ph|0)==(0|0);
             $i$0$ph236 = $i$0$ph;
             while(1) {
              L86: while(1) {
               $63 = HEAP32[$rpos144>>2]|0;
               $64 = HEAP32[$shend145>>2]|0;
               $cmp315 = ($63>>>0)<($64>>>0);
               if ($cmp315) {
                $incdec$ptr319 = ((($63)) + 1|0);
                HEAP32[$rpos144>>2] = $incdec$ptr319;
                $65 = HEAP8[$63>>0]|0;
                $conv320 = $65&255;
                $cond324 = $conv320;
               } else {
                $call322 = (___shgetc($f)|0);
                $cond324 = $call322;
               }
               $add325 = (($cond324) + 1)|0;
               $arrayidx326 = (($scanset) + ($add325)|0);
               $66 = HEAP8[$arrayidx326>>0]|0;
               $tobool327 = ($66<<24>>24)==(0);
               if ($tobool327) {
                break L82;
               }
               $conv330 = $cond324&255;
               HEAP8[$$compoundliteral329>>0] = $conv330;
               $call331 = (_mbrtowc($wc,$$compoundliteral329,1,$st)|0);
               switch ($call331|0) {
               case -1:  {
                $102 = $$ph;$narrow350 = $narrow;$s$7 = 0;
                label = 137;
                break L6;
                break;
               }
               case -2:  {
                break;
               }
               default: {
                break L86;
               }
               }
              }
              if ($tobool335) {
               $i$1 = $i$0$ph236;
              } else {
               $arrayidx338 = (($$ph) + ($i$0$ph236<<2)|0);
               $inc337 = (($i$0$ph236) + 1)|0;
               $67 = HEAP32[$wc>>2]|0;
               HEAP32[$arrayidx338>>2] = $67;
               $i$1 = $inc337;
              }
              $cmp342 = ($i$1|0)==($k$0$ph|0);
              $or$cond = $narrow & $cmp342;
              if ($or$cond) {
               break;
              } else {
               $i$0$ph236 = $i$1;
              }
             }
             $factor232 = $k$0$ph << 1;
             $add346 = $factor232 | 1;
             $mul347 = $add346 << 2;
             $call348 = (_realloc($$ph,$mul347)|0);
             $tobool349 = ($call348|0)==(0|0);
             if ($tobool349) {
              $102 = $$ph;$narrow350 = 1;$s$7 = 0;
              label = 137;
              break L6;
             } else {
              $i$0$ph$phi = $k$0$ph;$$ph = $call348;$k$0$ph = $add346;$i$0$ph = $i$0$ph$phi;
             }
            }
            $call354 = (_mbsinit($st)|0);
            $tobool355 = ($call354|0)==(0);
            if ($tobool355) {
             $102 = $$ph;$narrow350 = $narrow;$s$7 = 0;
             label = 137;
             break L6;
            } else {
             $105 = $$ph;$i$4 = $i$0$ph236;$s$4 = 0;$wcs$5 = $$ph;
            }
           } else {
            if ($narrow) {
             $call361 = (_malloc($cond299)|0);
             $tobool362 = ($call361|0)==(0|0);
             if ($tobool362) {
              $102 = 0;$narrow350 = 1;$s$7 = 0;
              label = 137;
              break L6;
             } else {
              $i$2$ph = 0;$k$1$ph = $cond299;$s$2$ph = $call361;
             }
             while(1) {
              $i$2 = $i$2$ph;
              while(1) {
               $68 = HEAP32[$rpos144>>2]|0;
               $69 = HEAP32[$shend145>>2]|0;
               $cmp368 = ($68>>>0)<($69>>>0);
               if ($cmp368) {
                $incdec$ptr372 = ((($68)) + 1|0);
                HEAP32[$rpos144>>2] = $incdec$ptr372;
                $70 = HEAP8[$68>>0]|0;
                $conv373 = $70&255;
                $cond377 = $conv373;
               } else {
                $call375 = (___shgetc($f)|0);
                $cond377 = $call375;
               }
               $add378 = (($cond377) + 1)|0;
               $arrayidx379 = (($scanset) + ($add378)|0);
               $71 = HEAP8[$arrayidx379>>0]|0;
               $tobool380 = ($71<<24>>24)==(0);
               if ($tobool380) {
                $105 = 0;$i$4 = $i$2;$s$4 = $s$2$ph;$wcs$5 = 0;
                break L77;
               }
               $conv382 = $cond377&255;
               $inc383 = (($i$2) + 1)|0;
               $arrayidx384 = (($s$2$ph) + ($i$2)|0);
               HEAP8[$arrayidx384>>0] = $conv382;
               $cmp385 = ($inc383|0)==($k$1$ph|0);
               if ($cmp385) {
                break;
               } else {
                $i$2 = $inc383;
               }
              }
              $factor = $k$1$ph << 1;
              $add389 = $factor | 1;
              $call392 = (_realloc($s$2$ph,$add389)|0);
              $tobool393 = ($call392|0)==(0|0);
              if ($tobool393) {
               $102 = 0;$narrow350 = 1;$s$7 = $s$2$ph;
               label = 137;
               break L6;
              } else {
               $i$2$ph$phi = $k$1$ph;$k$1$ph = $add389;$s$2$ph = $call392;$i$2$ph = $i$2$ph$phi;
              }
             }
            }
            $tobool402 = ($dest$0|0)==(0|0);
            if ($tobool402) {
             $77 = $51;
             while(1) {
              $76 = HEAP32[$rpos144>>2]|0;
              $cmp429 = ($76>>>0)<($77>>>0);
              if ($cmp429) {
               $incdec$ptr433 = ((($76)) + 1|0);
               HEAP32[$rpos144>>2] = $incdec$ptr433;
               $78 = HEAP8[$76>>0]|0;
               $conv434 = $78&255;
               $cond438 = $conv434;
              } else {
               $call436 = (___shgetc($f)|0);
               $cond438 = $call436;
              }
              $add439 = (($cond438) + 1)|0;
              $arrayidx440 = (($scanset) + ($add439)|0);
              $79 = HEAP8[$arrayidx440>>0]|0;
              $tobool441 = ($79<<24>>24)==(0);
              if ($tobool441) {
               $105 = 0;$i$4 = 0;$s$4 = 0;$wcs$5 = 0;
               break L77;
              }
              $$pre389 = HEAP32[$shend145>>2]|0;
              $77 = $$pre389;
             }
            } else {
             $73 = $51;$i$3 = 0;
             while(1) {
              $72 = HEAP32[$rpos144>>2]|0;
              $cmp407 = ($72>>>0)<($73>>>0);
              if ($cmp407) {
               $incdec$ptr411 = ((($72)) + 1|0);
               HEAP32[$rpos144>>2] = $incdec$ptr411;
               $74 = HEAP8[$72>>0]|0;
               $conv412 = $74&255;
               $cond416 = $conv412;
              } else {
               $call414 = (___shgetc($f)|0);
               $cond416 = $call414;
              }
              $add417 = (($cond416) + 1)|0;
              $arrayidx418 = (($scanset) + ($add417)|0);
              $75 = HEAP8[$arrayidx418>>0]|0;
              $tobool419 = ($75<<24>>24)==(0);
              if ($tobool419) {
               $105 = 0;$i$4 = $i$3;$s$4 = $dest$0;$wcs$5 = 0;
               break L77;
              }
              $conv421 = $cond416&255;
              $inc422 = (($i$3) + 1)|0;
              $arrayidx423 = (($dest$0) + ($i$3)|0);
              HEAP8[$arrayidx423>>0] = $conv421;
              $$pre388 = HEAP32[$shend145>>2]|0;
              $73 = $$pre388;$i$3 = $inc422;
             }
            }
           }
          } while(0);
          $80 = HEAP32[$shend145>>2]|0;
          $tobool448 = ($80|0)==(0|0);
          if ($tobool448) {
           $$pre390 = HEAP32[$rpos144>>2]|0;
           $85 = $$pre390;
          } else {
           $81 = HEAP32[$rpos144>>2]|0;
           $incdec$ptr451 = ((($81)) + -1|0);
           HEAP32[$rpos144>>2] = $incdec$ptr451;
           $82 = $incdec$ptr451;
           $85 = $82;
          }
          $83 = HEAP32[$shcnt167>>2]|0;
          $84 = HEAP32[$rend169>>2]|0;
          $sub$ptr$sub459 = (($85) - ($84))|0;
          $add460 = (($sub$ptr$sub459) + ($83))|0;
          $tobool461 = ($add460|0)==(0);
          if ($tobool461) {
           $$ph245 = $105;$s$9$ph = $s$4;
           label = 139;
           break L6;
          }
          $cmp200$not = $cmp200 ^ 1;
          $cmp474 = ($add460|0)==($width$1|0);
          $or$cond223 = $cmp474 | $cmp200$not;
          if (!($or$cond223)) {
           $$ph245 = $105;$s$9$ph = $s$4;
           label = 139;
           break L6;
          }
          do {
           if ($narrow) {
            if ($cmp300) {
             HEAP32[$dest$0>>2] = $wcs$5;
             break;
            } else {
             HEAP32[$dest$0>>2] = $s$4;
             break;
            }
           }
          } while(0);
          if ($cmp200) {
           $103 = $105;$p$10 = $p$9;$s$5 = $s$4;
          } else {
           $tobool489 = ($wcs$5|0)==(0|0);
           if (!($tobool489)) {
            $arrayidx491 = (($wcs$5) + ($i$4<<2)|0);
            HEAP32[$arrayidx491>>2] = 0;
           }
           $tobool493 = ($s$4|0)==(0|0);
           if ($tobool493) {
            $103 = $105;$p$10 = $p$9;$s$5 = 0;
            break L55;
           }
           $arrayidx495 = (($s$4) + ($i$4)|0);
           HEAP8[$arrayidx495>>0] = 0;
           $103 = $105;$p$10 = $p$9;$s$5 = $s$4;
          }
          break;
         }
         case 120: case 88: case 112:  {
          $base$0 = 16;
          label = 125;
          break;
         }
         case 111:  {
          $base$0 = 8;
          label = 125;
          break;
         }
         case 117: case 100:  {
          $base$0 = 10;
          label = 125;
          break;
         }
         case 105:  {
          $base$0 = 0;
          label = 125;
          break;
         }
         case 71: case 103: case 70: case 102: case 69: case 101: case 65: case 97:  {
          $call522 = (+___floatscan($f,$$size$0,0));
          $92 = HEAP32[$shcnt167>>2]|0;
          $93 = HEAP32[$rpos144>>2]|0;
          $94 = HEAP32[$rend169>>2]|0;
          $sub$ptr$sub528221 = (($94) - ($93))|0;
          $tobool530 = ($92|0)==($sub$ptr$sub528221|0);
          if ($tobool530) {
           $$ph245 = $$;$s$9$ph = $$s$0;
           label = 139;
           break L6;
          }
          $tobool533 = ($dest$0|0)==(0|0);
          if ($tobool533) {
           $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
          } else {
           switch ($$size$0|0) {
           case 0:  {
            $conv536 = $call522;
            HEAPF32[$dest$0>>2] = $conv536;
            $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
            break L55;
            break;
           }
           case 1:  {
            HEAPF64[$dest$0>>3] = $call522;
            $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
            break L55;
            break;
           }
           case 2:  {
            HEAPF64[$dest$0>>3] = $call522;
            $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
            break L55;
            break;
           }
           default: {
            $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
            break L55;
           }
           }
          }
          break;
         }
         default: {
          $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
         }
         }
        } while(0);
        do {
         if ((label|0) == 125) {
          label = 0;
          $86 = (___intscan($f,$base$0,0,-1,-1)|0);
          $87 = tempRet0;
          $88 = HEAP32[$shcnt167>>2]|0;
          $89 = HEAP32[$rpos144>>2]|0;
          $90 = HEAP32[$rend169>>2]|0;
          $sub$ptr$sub508222 = (($90) - ($89))|0;
          $tobool510 = ($88|0)==($sub$ptr$sub508222|0);
          if ($tobool510) {
           $$ph245 = $$;$s$9$ph = $$s$0;
           label = 139;
           break L6;
          }
          $cmp513 = ($or$conv130|0)==(112);
          $or$cond1 = $tobool103 & $cmp513;
          if ($or$cond1) {
           $91 = $86;
           HEAP32[$dest$0>>2] = $91;
           $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
           break;
          } else {
           _store_int($dest$0,$$size$0,$86,$87);
           $103 = $$;$p$10 = $p$5;$s$5 = $$s$0;
           break;
          }
         }
        } while(0);
        $95 = HEAP32[$shcnt167>>2]|0;
        $96 = HEAP32[$rpos144>>2]|0;
        $97 = HEAP32[$rend169>>2]|0;
        $sub$ptr$sub547 = (($95) + ($pos$1))|0;
        $add548 = (($sub$ptr$sub547) + ($96))|0;
        $add549 = (($add548) - ($97))|0;
        $inc552 = $tobool103&1;
        $matches$0$inc552 = (($inc552) + ($matches$0312))|0;
        $100 = $103;$matches$1 = $matches$0$inc552;$p$11 = $p$10;$pos$2 = $add549;$s$6 = $s$5;
        break L8;
       }
      } while(0);
      $conv40 = $cmp31&1;
      $add$ptr = (($p$0316) + ($conv40)|0);
      ___shlim($f,0);
      $16 = HEAP32[$rpos144>>2]|0;
      $17 = HEAP32[$shend145>>2]|0;
      $cmp43 = ($16>>>0)<($17>>>0);
      if ($cmp43) {
       $incdec$ptr47 = ((($16)) + 1|0);
       HEAP32[$rpos144>>2] = $incdec$ptr47;
       $18 = HEAP8[$16>>0]|0;
       $conv48 = $18&255;
       $cond52 = $conv48;
      } else {
       $call50 = (___shgetc($f)|0);
       $cond52 = $call50;
      }
      $19 = HEAP8[$add$ptr>>0]|0;
      $conv53 = $19&255;
      $cmp54 = ($cond52|0)==($conv53|0);
      if (!($cmp54)) {
       label = 22;
       break L6;
      }
      $inc = (($pos$0315) + 1)|0;
      $100 = $32;$matches$1 = $matches$0312;$p$11 = $add$ptr;$pos$2 = $inc;$s$6 = $s$0310;
     } else {
      $p$1 = $p$0316;
      while(1) {
       $arrayidx = ((($p$1)) + 1|0);
       $5 = HEAP8[$arrayidx>>0]|0;
       $conv3 = $5&255;
       $call4 = (_isspace($conv3)|0);
       $tobool5 = ($call4|0)==(0);
       if ($tobool5) {
        break;
       } else {
        $p$1 = $arrayidx;
       }
      }
      ___shlim($f,0);
      while(1) {
       $6 = HEAP32[$rpos144>>2]|0;
       $7 = HEAP32[$shend145>>2]|0;
       $cmp7 = ($6>>>0)<($7>>>0);
       if ($cmp7) {
        $incdec$ptr11 = ((($6)) + 1|0);
        HEAP32[$rpos144>>2] = $incdec$ptr11;
        $8 = HEAP8[$6>>0]|0;
        $conv12 = $8&255;
        $cond16 = $conv12;
       } else {
        $call14 = (___shgetc($f)|0);
        $cond16 = $call14;
       }
       $call17 = (_isspace($cond16)|0);
       $tobool18 = ($call17|0)==(0);
       if ($tobool18) {
        break;
       }
      }
      $9 = HEAP32[$shend145>>2]|0;
      $tobool22 = ($9|0)==(0|0);
      if ($tobool22) {
       $$pre = HEAP32[$rpos144>>2]|0;
       $14 = $$pre;
      } else {
       $10 = HEAP32[$rpos144>>2]|0;
       $incdec$ptr25 = ((($10)) + -1|0);
       HEAP32[$rpos144>>2] = $incdec$ptr25;
       $11 = $incdec$ptr25;
       $14 = $11;
      }
      $12 = HEAP32[$shcnt167>>2]|0;
      $13 = HEAP32[$rend169>>2]|0;
      $sub$ptr$sub = (($12) + ($pos$0315))|0;
      $add = (($sub$ptr$sub) + ($14))|0;
      $add29 = (($add) - ($13))|0;
      $100 = $32;$matches$1 = $matches$0312;$p$11 = $p$1;$pos$2 = $add29;$s$6 = $s$0310;
     }
    } while(0);
    $incdec$ptr555 = ((($p$11)) + 1|0);
    $98 = HEAP8[$incdec$ptr555>>0]|0;
    $tobool = ($98<<24>>24)==(0);
    if ($tobool) {
     $matches$3 = $matches$1;
     break L4;
    } else {
     $32 = $100;$4 = $98;$matches$0312 = $matches$1;$p$0316 = $incdec$ptr555;$pos$0315 = $pos$2;$s$0310 = $s$6;
    }
   }
   if ((label|0) == 22) {
    $20 = HEAP32[$shend145>>2]|0;
    $tobool58 = ($20|0)==(0|0);
    if (!($tobool58)) {
     $21 = HEAP32[$rpos144>>2]|0;
     $incdec$ptr61 = ((($21)) + -1|0);
     HEAP32[$rpos144>>2] = $incdec$ptr61;
    }
    $cmp64 = ($cond52|0)>(-1);
    $tobool558 = ($matches$0312|0)!=(0);
    $or$cond2 = $tobool558 | $cmp64;
    if ($or$cond2) {
     $matches$3 = $matches$0312;
     break;
    } else {
     $101 = $32;$alloc$1 = 0;$s$8 = $s$0310;
     label = 138;
    }
   }
   else if ((label|0) == 137) {
    $lnot$ext$$le326 = $narrow350&1;
    $tobool558$old = ($matches$0312|0)==(0);
    if ($tobool558$old) {
     $101 = $102;$alloc$1 = $lnot$ext$$le326;$s$8 = $s$7;
     label = 138;
    } else {
     $99 = $102;$alloc$2 = $lnot$ext$$le326;$matches$2 = $matches$0312;$s$9 = $s$7;
    }
   }
   else if ((label|0) == 139) {
    $lnot$ext$$le324 = $narrow&1;
    $99 = $$ph245;$alloc$2 = $lnot$ext$$le324;$matches$2 = $matches$0312;$s$9 = $s$9$ph;
   }
   if ((label|0) == 138) {
    $99 = $101;$alloc$2 = $alloc$1;$matches$2 = -1;$s$9 = $s$8;
   }
   $tobool561 = ($alloc$2|0)==(0);
   if ($tobool561) {
    $matches$3 = $matches$2;
   } else {
    _free($s$9);
    _free($99);
    $matches$3 = $matches$2;
   }
  }
 } while(0);
 $tobool565 = ($cond|0)==(0);
 if (!($tobool565)) {
  ___unlockfile($f);
 }
 STACKTOP = sp;return ($matches$3|0);
}
function _isspace($c) {
 $c = $c|0;
 var $0 = 0, $cmp = 0, $cmp1 = 0, $lor$ext = 0, $sub = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($c|0)==(32);
 $sub = (($c) + -9)|0;
 $cmp1 = ($sub>>>0)<(5);
 $0 = $cmp | $cmp1;
 $lor$ext = $0&1;
 return ($lor$ext|0);
}
function ___shlim($f,$lim) {
 $f = $f|0;
 $lim = $lim|0;
 var $$sink = 0, $0 = 0, $1 = 0, $add$ptr = 0, $cmp = 0, $or$cond = 0, $rend = 0, $rpos = 0, $shcnt = 0, $shend4 = 0, $shlim = 0, $sub$ptr$lhs$cast = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$sub = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shlim = ((($f)) + 104|0);
 HEAP32[$shlim>>2] = $lim;
 $rend = ((($f)) + 8|0);
 $0 = HEAP32[$rend>>2]|0;
 $rpos = ((($f)) + 4|0);
 $1 = HEAP32[$rpos>>2]|0;
 $sub$ptr$lhs$cast = $0;
 $sub$ptr$rhs$cast = $1;
 $sub$ptr$sub = (($sub$ptr$lhs$cast) - ($sub$ptr$rhs$cast))|0;
 $shcnt = ((($f)) + 108|0);
 HEAP32[$shcnt>>2] = $sub$ptr$sub;
 $tobool = ($lim|0)!=(0);
 $cmp = ($sub$ptr$sub|0)>($lim|0);
 $or$cond = $tobool & $cmp;
 $add$ptr = (($1) + ($lim)|0);
 $$sink = $or$cond ? $add$ptr : $0;
 $shend4 = ((($f)) + 100|0);
 HEAP32[$shend4>>2] = $$sink;
 return;
}
function ___shgetc($f) {
 $f = $f|0;
 var $$phi$trans$insert$phi$trans$insert = 0, $$pre = 0, $$pre26$pre = 0, $$pre29 = 0, $$sink = 0, $0 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $add$ptr = 0, $add29 = 0, $arrayidx = 0;
 var $call = 0, $cmp = 0, $cmp2 = 0, $cmp32 = 0, $cmp9 = 0, $conv = 0, $conv35 = 0, $rend17$phi$trans$insert = 0, $retval$0 = 0, $rpos = 0, $shcnt = 0, $shcnt28$pre$phiZ2D = 0, $shcnt7 = 0, $shend = 0, $shend18 = 0, $shlim = 0, $sub = 0, $sub$ptr$lhs$cast25 = 0, $sub$ptr$rhs$cast = 0, $sub$ptr$rhs$cast26 = 0;
 var $sub$ptr$sub = 0, $sub$ptr$sub27 = 0, $sub8 = 0, $tobool = 0, $tobool21 = 0, $tobool4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $shlim = ((($f)) + 104|0);
 $0 = HEAP32[$shlim>>2]|0;
 $tobool = ($0|0)==(0);
 if ($tobool) {
  label = 3;
 } else {
  $shcnt = ((($f)) + 108|0);
  $1 = HEAP32[$shcnt>>2]|0;
  $cmp = ($1|0)<($0|0);
  if ($cmp) {
   label = 3;
  } else {
   label = 4;
  }
 }
 if ((label|0) == 3) {
  $call = (___uflow($f)|0);
  $cmp2 = ($call|0)<(0);
  if ($cmp2) {
   label = 4;
  } else {
   $2 = HEAP32[$shlim>>2]|0;
   $tobool4 = ($2|0)==(0);
   $rend17$phi$trans$insert = ((($f)) + 8|0);
   if ($tobool4) {
    $$pre = HEAP32[$rend17$phi$trans$insert>>2]|0;
    $$phi$trans$insert$phi$trans$insert = ((($f)) + 4|0);
    $$pre26$pre = HEAP32[$$phi$trans$insert$phi$trans$insert>>2]|0;
    $$pre29 = ((($f)) + 108|0);
    $$sink = $$pre;$7 = $$pre;$8 = $$pre26$pre;$shcnt28$pre$phiZ2D = $$pre29;
   } else {
    $3 = HEAP32[$rend17$phi$trans$insert>>2]|0;
    $rpos = ((($f)) + 4|0);
    $4 = HEAP32[$rpos>>2]|0;
    $sub$ptr$rhs$cast = $4;
    $sub$ptr$sub = (($3) - ($sub$ptr$rhs$cast))|0;
    $shcnt7 = ((($f)) + 108|0);
    $5 = HEAP32[$shcnt7>>2]|0;
    $sub = (($2) - ($5))|0;
    $cmp9 = ($sub$ptr$sub|0)<($sub|0);
    $6 = $3;
    if ($cmp9) {
     $$sink = $6;$7 = $6;$8 = $4;$shcnt28$pre$phiZ2D = $shcnt7;
    } else {
     $sub8 = (($sub) + -1)|0;
     $add$ptr = (($4) + ($sub8)|0);
     $$sink = $add$ptr;$7 = $6;$8 = $4;$shcnt28$pre$phiZ2D = $shcnt7;
    }
   }
   $shend18 = ((($f)) + 100|0);
   HEAP32[$shend18>>2] = $$sink;
   $tobool21 = ($7|0)==(0|0);
   if (!($tobool21)) {
    $sub$ptr$lhs$cast25 = $7;
    $sub$ptr$rhs$cast26 = $8;
    $9 = HEAP32[$shcnt28$pre$phiZ2D>>2]|0;
    $sub$ptr$sub27 = (($sub$ptr$lhs$cast25) + 1)|0;
    $add = (($sub$ptr$sub27) - ($sub$ptr$rhs$cast26))|0;
    $add29 = (($add) + ($9))|0;
    HEAP32[$shcnt28$pre$phiZ2D>>2] = $add29;
   }
   $arrayidx = ((($8)) + -1|0);
   $10 = HEAP8[$arrayidx>>0]|0;
   $conv = $10&255;
   $cmp32 = ($conv|0)==($call|0);
   if ($cmp32) {
    $retval$0 = $call;
   } else {
    $conv35 = $call&255;
    HEAP8[$arrayidx>>0] = $conv35;
    $retval$0 = $call;
   }
  }
 }
 if ((label|0) == 4) {
  $shend = ((($f)) + 100|0);
  HEAP32[$shend>>2] = 0;
  $retval$0 = -1;
 }
 return ($retval$0|0);
}
function _arg_n($ap,$n) {
 $ap = $ap|0;
 $n = $n|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $ap2 = 0, $arglist_current = 0, $arglist_next = 0, $cmp = 0, $dec = 0, $expanded = 0, $expanded1 = 0, $expanded3 = 0, $expanded4 = 0, $expanded5 = 0, $i$0 = 0, $vacopy_currentptr = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ap2 = sp;
 $vacopy_currentptr = HEAP32[$ap>>2]|0;
 HEAP32[$ap2>>2] = $vacopy_currentptr;
 $i$0 = $n;
 while(1) {
  $cmp = ($i$0>>>0)>(1);
  $arglist_current = HEAP32[$ap2>>2]|0;
  $0 = $arglist_current;
  $1 = ((0) + 4|0);
  $expanded1 = $1;
  $expanded = (($expanded1) - 1)|0;
  $2 = (($0) + ($expanded))|0;
  $3 = ((0) + 4|0);
  $expanded5 = $3;
  $expanded4 = (($expanded5) - 1)|0;
  $expanded3 = $expanded4 ^ -1;
  $4 = $2 & $expanded3;
  $5 = $4;
  $6 = HEAP32[$5>>2]|0;
  $arglist_next = ((($5)) + 4|0);
  HEAP32[$ap2>>2] = $arglist_next;
  $dec = (($i$0) + -1)|0;
  if ($cmp) {
   $i$0 = $dec;
  } else {
   break;
  }
 }
 STACKTOP = sp;return ($6|0);
}
function _store_int($dest,$size,$0,$1) {
 $dest = $dest|0;
 $size = $size|0;
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $tobool = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $tobool = ($dest|0)==(0|0);
 L1: do {
  if (!($tobool)) {
   switch ($size|0) {
   case -2:  {
    $2 = $0&255;
    HEAP8[$dest>>0] = $2;
    break L1;
    break;
   }
   case -1:  {
    $3 = $0&65535;
    HEAP16[$dest>>1] = $3;
    break L1;
    break;
   }
   case 0:  {
    HEAP32[$dest>>2] = $0;
    break L1;
    break;
   }
   case 1:  {
    HEAP32[$dest>>2] = $0;
    break L1;
    break;
   }
   case 3:  {
    $4 = $dest;
    $5 = $4;
    HEAP32[$5>>2] = $0;
    $6 = (($4) + 4)|0;
    $7 = $6;
    HEAP32[$7>>2] = $1;
    break L1;
    break;
   }
   default: {
    break L1;
   }
   }
  }
 } while(0);
 return;
}
function ___intscan($f,$base,$pok,$0,$1) {
 $f = $f|0;
 $base = $base|0;
 $pok = $pok|0;
 $0 = $0|0;
 $1 = $1|0;
 var $$base132 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0;
 var $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0;
 var $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $add = 0, $add249 = 0, $and = 0;
 var $and174 = 0, $arrayidx = 0, $arrayidx175 = 0, $arrayidx178 = 0, $arrayidx178157 = 0, $arrayidx206 = 0, $arrayidx237 = 0, $arrayidx237175 = 0, $arrayidx266 = 0, $arrayidx305 = 0, $arrayidx311 = 0, $arrayidx93 = 0, $base$addr$1 = 0, $base$addr$1134 = 0, $base$addr$1135 = 0, $c$0 = 0, $c$1 = 0, $c$1136 = 0, $c$2$be = 0, $c$2$lcssa = 0;
 var $c$3$be = 0, $c$3184 = 0, $c$4$be = 0, $c$4$lcssa = 0, $c$5$be = 0, $c$6$be = 0, $c$6$lcssa = 0, $c$7$be = 0, $c$7167 = 0, $c$8 = 0, $c$9$be = 0, $call = 0, $call105 = 0, $call126 = 0, $call160 = 0, $call200 = 0, $call21 = 0, $call231 = 0, $call260 = 0, $call299 = 0;
 var $call3 = 0, $call326 = 0, $call330 = 0, $call351 = 0, $call357 = 0, $call4 = 0, $call42 = 0, $call57 = 0, $cmp = 0, $cmp1 = 0, $cmp108 = 0, $cmp112 = 0, $cmp112191 = 0, $cmp114 = 0, $cmp119 = 0, $cmp132 = 0, $cmp132183 = 0, $cmp14 = 0, $cmp153 = 0, $cmp165 = 0;
 var $cmp180 = 0, $cmp180159 = 0, $cmp183 = 0, $cmp193 = 0, $cmp208 = 0, $cmp208152 = 0, $cmp224 = 0, $cmp239 = 0, $cmp239177 = 0, $cmp242 = 0, $cmp25 = 0, $cmp253 = 0, $cmp268 = 0, $cmp268166 = 0, $cmp292 = 0, $cmp30 = 0, $cmp307 = 0, $cmp313 = 0, $cmp319 = 0, $cmp35 = 0;
 var $cmp45 = 0, $cmp50 = 0, $cmp61 = 0, $cmp7 = 0, $cmp95 = 0, $cond = 0, $cond44 = 0, $cond59 = 0, $conv = 0, $conv124 = 0, $conv158 = 0, $conv176 = 0, $conv179 = 0, $conv179158 = 0, $conv179161 = 0, $conv19 = 0, $conv198 = 0, $conv207 = 0, $conv207151 = 0, $conv229 = 0;
 var $conv238 = 0, $conv238176 = 0, $conv238179 = 0, $conv258 = 0, $conv267 = 0, $conv267165 = 0, $conv297 = 0, $conv306 = 0, $conv312 = 0, $conv324 = 0, $conv40 = 0, $conv55 = 0, $conv94 = 0, $incdec$ptr = 0, $incdec$ptr102 = 0, $incdec$ptr123 = 0, $incdec$ptr157 = 0, $incdec$ptr18 = 0, $incdec$ptr197 = 0, $incdec$ptr228 = 0;
 var $incdec$ptr257 = 0, $incdec$ptr296 = 0, $incdec$ptr323 = 0, $incdec$ptr340 = 0, $incdec$ptr39 = 0, $incdec$ptr54 = 0, $incdec$ptr68 = 0, $incdec$ptr77 = 0, $mul = 0, $mul173 = 0, $mul246 = 0, $neg$0 = 0, $neg$0$ = 0, $neg$1 = 0, $or = 0, $or$cond = 0, $or$cond154 = 0, $or$cond2 = 0, $or$cond3 = 0, $or$cond5 = 0;
 var $or189 = 0, $rpos = 0, $shend = 0, $shl = 0, $shr = 0, $sub = 0, $sub111 = 0, $sub111190 = 0, $sub111193 = 0, $sub131 = 0, $sub131182 = 0, $sub131186 = 0, $sub170 = 0, $tobool = 0, $tobool171 = 0, $tobool337 = 0, $tobool349 = 0, $tobool65 = 0, $tobool71 = 0, $tobool99 = 0;
 var $x$0192 = 0, $x$1160 = 0, $x$2178 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($base>>>0)>(36);
 L1: do {
  if ($cmp) {
   $call = (___errno_location()|0);
   HEAP32[$call>>2] = 22;
   $150 = 0;$151 = 0;
  } else {
   $rpos = ((($f)) + 4|0);
   $shend = ((($f)) + 100|0);
   while(1) {
    $2 = HEAP32[$rpos>>2]|0;
    $3 = HEAP32[$shend>>2]|0;
    $cmp1 = ($2>>>0)<($3>>>0);
    if ($cmp1) {
     $incdec$ptr = ((($2)) + 1|0);
     HEAP32[$rpos>>2] = $incdec$ptr;
     $4 = HEAP8[$2>>0]|0;
     $conv = $4&255;
     $cond = $conv;
    } else {
     $call3 = (___shgetc($f)|0);
     $cond = $call3;
    }
    $call4 = (_isspace($cond)|0);
    $tobool = ($call4|0)==(0);
    if ($tobool) {
     break;
    }
   }
   L11: do {
    switch ($cond|0) {
    case 43: case 45:  {
     $cmp7 = ($cond|0)==(45);
     $sub = $cmp7 << 31 >> 31;
     $5 = HEAP32[$rpos>>2]|0;
     $6 = HEAP32[$shend>>2]|0;
     $cmp14 = ($5>>>0)<($6>>>0);
     if ($cmp14) {
      $incdec$ptr18 = ((($5)) + 1|0);
      HEAP32[$rpos>>2] = $incdec$ptr18;
      $7 = HEAP8[$5>>0]|0;
      $conv19 = $7&255;
      $c$0 = $conv19;$neg$0 = $sub;
      break L11;
     } else {
      $call21 = (___shgetc($f)|0);
      $c$0 = $call21;$neg$0 = $sub;
      break L11;
     }
     break;
    }
    default: {
     $c$0 = $cond;$neg$0 = 0;
    }
    }
   } while(0);
   $cmp25 = ($base|0)==(0);
   $8 = $base | 16;
   $9 = ($8|0)==(16);
   $cmp30 = ($c$0|0)==(48);
   $or$cond2 = $9 & $cmp30;
   do {
    if ($or$cond2) {
     $10 = HEAP32[$rpos>>2]|0;
     $11 = HEAP32[$shend>>2]|0;
     $cmp35 = ($10>>>0)<($11>>>0);
     if ($cmp35) {
      $incdec$ptr39 = ((($10)) + 1|0);
      HEAP32[$rpos>>2] = $incdec$ptr39;
      $12 = HEAP8[$10>>0]|0;
      $conv40 = $12&255;
      $cond44 = $conv40;
     } else {
      $call42 = (___shgetc($f)|0);
      $cond44 = $call42;
     }
     $or = $cond44 | 32;
     $cmp45 = ($or|0)==(120);
     if (!($cmp45)) {
      if ($cmp25) {
       $base$addr$1135 = 8;$c$1136 = $cond44;
       label = 46;
       break;
      } else {
       $base$addr$1 = $base;$c$1 = $cond44;
       label = 32;
       break;
      }
     }
     $13 = HEAP32[$rpos>>2]|0;
     $14 = HEAP32[$shend>>2]|0;
     $cmp50 = ($13>>>0)<($14>>>0);
     if ($cmp50) {
      $incdec$ptr54 = ((($13)) + 1|0);
      HEAP32[$rpos>>2] = $incdec$ptr54;
      $15 = HEAP8[$13>>0]|0;
      $conv55 = $15&255;
      $cond59 = $conv55;
     } else {
      $call57 = (___shgetc($f)|0);
      $cond59 = $call57;
     }
     $arrayidx = ((3460) + ($cond59)|0);
     $16 = HEAP8[$arrayidx>>0]|0;
     $cmp61 = ($16&255)>(15);
     if ($cmp61) {
      $17 = HEAP32[$shend>>2]|0;
      $tobool65 = ($17|0)!=(0|0);
      if ($tobool65) {
       $18 = HEAP32[$rpos>>2]|0;
       $incdec$ptr68 = ((($18)) + -1|0);
       HEAP32[$rpos>>2] = $incdec$ptr68;
      }
      $tobool71 = ($pok|0)==(0);
      if ($tobool71) {
       ___shlim($f,0);
       $150 = 0;$151 = 0;
       break L1;
      }
      if (!($tobool65)) {
       $150 = 0;$151 = 0;
       break L1;
      }
      $19 = HEAP32[$rpos>>2]|0;
      $incdec$ptr77 = ((($19)) + -1|0);
      HEAP32[$rpos>>2] = $incdec$ptr77;
      $150 = 0;$151 = 0;
      break L1;
     } else {
      $base$addr$1135 = 16;$c$1136 = $cond59;
      label = 46;
     }
    } else {
     $$base132 = $cmp25 ? 10 : $base;
     $arrayidx93 = ((3460) + ($c$0)|0);
     $20 = HEAP8[$arrayidx93>>0]|0;
     $conv94 = $20&255;
     $cmp95 = ($conv94>>>0)<($$base132>>>0);
     if ($cmp95) {
      $base$addr$1 = $$base132;$c$1 = $c$0;
      label = 32;
     } else {
      $21 = HEAP32[$shend>>2]|0;
      $tobool99 = ($21|0)==(0|0);
      if (!($tobool99)) {
       $22 = HEAP32[$rpos>>2]|0;
       $incdec$ptr102 = ((($22)) + -1|0);
       HEAP32[$rpos>>2] = $incdec$ptr102;
      }
      ___shlim($f,0);
      $call105 = (___errno_location()|0);
      HEAP32[$call105>>2] = 22;
      $150 = 0;$151 = 0;
      break L1;
     }
    }
   } while(0);
   L43: do {
    if ((label|0) == 32) {
     $cmp108 = ($base$addr$1|0)==(10);
     if ($cmp108) {
      $sub111190 = (($c$1) + -48)|0;
      $cmp112191 = ($sub111190>>>0)<(10);
      if ($cmp112191) {
       $sub111193 = $sub111190;$x$0192 = 0;
       while(1) {
        $mul = ($x$0192*10)|0;
        $add = (($mul) + ($sub111193))|0;
        $23 = HEAP32[$rpos>>2]|0;
        $24 = HEAP32[$shend>>2]|0;
        $cmp119 = ($23>>>0)<($24>>>0);
        if ($cmp119) {
         $incdec$ptr123 = ((($23)) + 1|0);
         HEAP32[$rpos>>2] = $incdec$ptr123;
         $25 = HEAP8[$23>>0]|0;
         $conv124 = $25&255;
         $c$2$be = $conv124;
        } else {
         $call126 = (___shgetc($f)|0);
         $c$2$be = $call126;
        }
        $sub111 = (($c$2$be) + -48)|0;
        $cmp112 = ($sub111>>>0)<(10);
        $cmp114 = ($add>>>0)<(429496729);
        $26 = $cmp112 & $cmp114;
        if ($26) {
         $sub111193 = $sub111;$x$0192 = $add;
        } else {
         break;
        }
       }
       $152 = $add;$153 = 0;$c$2$lcssa = $c$2$be;
      } else {
       $152 = 0;$153 = 0;$c$2$lcssa = $c$1;
      }
      $sub131182 = (($c$2$lcssa) + -48)|0;
      $cmp132183 = ($sub131182>>>0)<(10);
      if ($cmp132183) {
       $27 = $152;$28 = $153;$c$3184 = $c$2$lcssa;$sub131186 = $sub131182;
       while(1) {
        $29 = (___muldi3(($27|0),($28|0),10,0)|0);
        $30 = tempRet0;
        $31 = ($sub131186|0)<(0);
        $32 = $31 << 31 >> 31;
        $33 = $sub131186 ^ -1;
        $34 = $32 ^ -1;
        $35 = ($30>>>0)>($34>>>0);
        $36 = ($29>>>0)>($33>>>0);
        $37 = ($30|0)==($34|0);
        $38 = $37 & $36;
        $39 = $35 | $38;
        if ($39) {
         $154 = $27;$155 = $28;$base$addr$1134 = 10;$c$8 = $c$3184;
         label = 72;
         break L43;
        }
        $40 = (_i64Add(($29|0),($30|0),($sub131186|0),($32|0))|0);
        $41 = tempRet0;
        $42 = HEAP32[$rpos>>2]|0;
        $43 = HEAP32[$shend>>2]|0;
        $cmp153 = ($42>>>0)<($43>>>0);
        if ($cmp153) {
         $incdec$ptr157 = ((($42)) + 1|0);
         HEAP32[$rpos>>2] = $incdec$ptr157;
         $44 = HEAP8[$42>>0]|0;
         $conv158 = $44&255;
         $c$3$be = $conv158;
        } else {
         $call160 = (___shgetc($f)|0);
         $c$3$be = $call160;
        }
        $sub131 = (($c$3$be) + -48)|0;
        $cmp132 = ($sub131>>>0)<(10);
        $45 = ($41>>>0)<(429496729);
        $46 = ($40>>>0)<(2576980378);
        $47 = ($41|0)==(429496729);
        $48 = $47 & $46;
        $49 = $45 | $48;
        $or$cond3 = $cmp132 & $49;
        if ($or$cond3) {
         $27 = $40;$28 = $41;$c$3184 = $c$3$be;$sub131186 = $sub131;
        } else {
         break;
        }
       }
       $cmp165 = ($sub131>>>0)>(9);
       if ($cmp165) {
        $126 = $41;$128 = $40;$neg$1 = $neg$0;
       } else {
        $154 = $40;$155 = $41;$base$addr$1134 = 10;$c$8 = $c$3$be;
        label = 72;
       }
      } else {
       $126 = $153;$128 = $152;$neg$1 = $neg$0;
      }
     } else {
      $base$addr$1135 = $base$addr$1;$c$1136 = $c$1;
      label = 46;
     }
    }
   } while(0);
   L63: do {
    if ((label|0) == 46) {
     $sub170 = (($base$addr$1135) + -1)|0;
     $and = $sub170 & $base$addr$1135;
     $tobool171 = ($and|0)==(0);
     if ($tobool171) {
      $mul173 = ($base$addr$1135*23)|0;
      $shr = $mul173 >>> 5;
      $and174 = $shr & 7;
      $arrayidx175 = (3716 + ($and174)|0);
      $51 = HEAP8[$arrayidx175>>0]|0;
      $conv176 = $51 << 24 >> 24;
      $arrayidx178157 = ((3460) + ($c$1136)|0);
      $52 = HEAP8[$arrayidx178157>>0]|0;
      $conv179158 = $52&255;
      $cmp180159 = ($conv179158>>>0)<($base$addr$1135>>>0);
      if ($cmp180159) {
       $conv179161 = $conv179158;$x$1160 = 0;
       while(1) {
        $shl = $x$1160 << $conv176;
        $or189 = $conv179161 | $shl;
        $53 = HEAP32[$rpos>>2]|0;
        $54 = HEAP32[$shend>>2]|0;
        $cmp193 = ($53>>>0)<($54>>>0);
        if ($cmp193) {
         $incdec$ptr197 = ((($53)) + 1|0);
         HEAP32[$rpos>>2] = $incdec$ptr197;
         $55 = HEAP8[$53>>0]|0;
         $conv198 = $55&255;
         $c$4$be = $conv198;
        } else {
         $call200 = (___shgetc($f)|0);
         $c$4$be = $call200;
        }
        $arrayidx178 = ((3460) + ($c$4$be)|0);
        $56 = HEAP8[$arrayidx178>>0]|0;
        $conv179 = $56&255;
        $cmp180 = ($conv179>>>0)<($base$addr$1135>>>0);
        $cmp183 = ($or189>>>0)<(134217728);
        $57 = $cmp183 & $cmp180;
        if ($57) {
         $conv179161 = $conv179;$x$1160 = $or189;
        } else {
         break;
        }
       }
       $60 = $56;$61 = 0;$63 = $or189;$c$4$lcssa = $c$4$be;
      } else {
       $60 = $52;$61 = 0;$63 = 0;$c$4$lcssa = $c$1136;
      }
      $58 = (_bitshift64Lshr(-1,-1,($conv176|0))|0);
      $59 = tempRet0;
      $conv207151 = $60&255;
      $cmp208152 = ($conv207151>>>0)>=($base$addr$1135>>>0);
      $62 = ($61>>>0)>($59>>>0);
      $64 = ($63>>>0)>($58>>>0);
      $65 = ($61|0)==($59|0);
      $66 = $65 & $64;
      $67 = $62 | $66;
      $or$cond154 = $cmp208152 | $67;
      if ($or$cond154) {
       $154 = $63;$155 = $61;$base$addr$1134 = $base$addr$1135;$c$8 = $c$4$lcssa;
       label = 72;
       break;
      } else {
       $68 = $63;$69 = $61;$73 = $60;
      }
      while(1) {
       $70 = (_bitshift64Shl(($68|0),($69|0),($conv176|0))|0);
       $71 = tempRet0;
       $72 = $73&255;
       $74 = $72 | $70;
       $75 = HEAP32[$rpos>>2]|0;
       $76 = HEAP32[$shend>>2]|0;
       $cmp224 = ($75>>>0)<($76>>>0);
       if ($cmp224) {
        $incdec$ptr228 = ((($75)) + 1|0);
        HEAP32[$rpos>>2] = $incdec$ptr228;
        $77 = HEAP8[$75>>0]|0;
        $conv229 = $77&255;
        $c$5$be = $conv229;
       } else {
        $call231 = (___shgetc($f)|0);
        $c$5$be = $call231;
       }
       $arrayidx206 = ((3460) + ($c$5$be)|0);
       $78 = HEAP8[$arrayidx206>>0]|0;
       $conv207 = $78&255;
       $cmp208 = ($conv207>>>0)>=($base$addr$1135>>>0);
       $79 = ($71>>>0)>($59>>>0);
       $80 = ($74>>>0)>($58>>>0);
       $81 = ($71|0)==($59|0);
       $82 = $81 & $80;
       $83 = $79 | $82;
       $or$cond = $cmp208 | $83;
       if ($or$cond) {
        $154 = $74;$155 = $71;$base$addr$1134 = $base$addr$1135;$c$8 = $c$5$be;
        label = 72;
        break L63;
       } else {
        $68 = $74;$69 = $71;$73 = $78;
       }
      }
     }
     $arrayidx237175 = ((3460) + ($c$1136)|0);
     $50 = HEAP8[$arrayidx237175>>0]|0;
     $conv238176 = $50&255;
     $cmp239177 = ($conv238176>>>0)<($base$addr$1135>>>0);
     if ($cmp239177) {
      $conv238179 = $conv238176;$x$2178 = 0;
      while(1) {
       $mul246 = Math_imul($x$2178, $base$addr$1135)|0;
       $add249 = (($conv238179) + ($mul246))|0;
       $84 = HEAP32[$rpos>>2]|0;
       $85 = HEAP32[$shend>>2]|0;
       $cmp253 = ($84>>>0)<($85>>>0);
       if ($cmp253) {
        $incdec$ptr257 = ((($84)) + 1|0);
        HEAP32[$rpos>>2] = $incdec$ptr257;
        $86 = HEAP8[$84>>0]|0;
        $conv258 = $86&255;
        $c$6$be = $conv258;
       } else {
        $call260 = (___shgetc($f)|0);
        $c$6$be = $call260;
       }
       $arrayidx237 = ((3460) + ($c$6$be)|0);
       $87 = HEAP8[$arrayidx237>>0]|0;
       $conv238 = $87&255;
       $cmp239 = ($conv238>>>0)<($base$addr$1135>>>0);
       $cmp242 = ($add249>>>0)<(119304647);
       $88 = $cmp242 & $cmp239;
       if ($88) {
        $conv238179 = $conv238;$x$2178 = $add249;
       } else {
        break;
       }
      }
      $156 = $add249;$157 = 0;$89 = $87;$c$6$lcssa = $c$6$be;
     } else {
      $156 = 0;$157 = 0;$89 = $50;$c$6$lcssa = $c$1136;
     }
     $conv267165 = $89&255;
     $cmp268166 = ($conv267165>>>0)<($base$addr$1135>>>0);
     if ($cmp268166) {
      $90 = (___udivdi3(-1,-1,($base$addr$1135|0),0)|0);
      $91 = tempRet0;
      $102 = $89;$92 = $157;$94 = $156;$c$7167 = $c$6$lcssa;
      while(1) {
       $93 = ($92>>>0)>($91>>>0);
       $95 = ($94>>>0)>($90>>>0);
       $96 = ($92|0)==($91|0);
       $97 = $96 & $95;
       $98 = $93 | $97;
       if ($98) {
        $154 = $94;$155 = $92;$base$addr$1134 = $base$addr$1135;$c$8 = $c$7167;
        label = 72;
        break L63;
       }
       $99 = (___muldi3(($94|0),($92|0),($base$addr$1135|0),0)|0);
       $100 = tempRet0;
       $101 = $102&255;
       $103 = $101 ^ -1;
       $104 = ($100>>>0)>(4294967295);
       $105 = ($99>>>0)>($103>>>0);
       $106 = ($100|0)==(-1);
       $107 = $106 & $105;
       $108 = $104 | $107;
       if ($108) {
        $154 = $94;$155 = $92;$base$addr$1134 = $base$addr$1135;$c$8 = $c$7167;
        label = 72;
        break L63;
       }
       $109 = (_i64Add(($101|0),0,($99|0),($100|0))|0);
       $110 = tempRet0;
       $111 = HEAP32[$rpos>>2]|0;
       $112 = HEAP32[$shend>>2]|0;
       $cmp292 = ($111>>>0)<($112>>>0);
       if ($cmp292) {
        $incdec$ptr296 = ((($111)) + 1|0);
        HEAP32[$rpos>>2] = $incdec$ptr296;
        $113 = HEAP8[$111>>0]|0;
        $conv297 = $113&255;
        $c$7$be = $conv297;
       } else {
        $call299 = (___shgetc($f)|0);
        $c$7$be = $call299;
       }
       $arrayidx266 = ((3460) + ($c$7$be)|0);
       $114 = HEAP8[$arrayidx266>>0]|0;
       $conv267 = $114&255;
       $cmp268 = ($conv267>>>0)<($base$addr$1135>>>0);
       if ($cmp268) {
        $102 = $114;$92 = $110;$94 = $109;$c$7167 = $c$7$be;
       } else {
        $154 = $109;$155 = $110;$base$addr$1134 = $base$addr$1135;$c$8 = $c$7$be;
        label = 72;
        break;
       }
      }
     } else {
      $154 = $156;$155 = $157;$base$addr$1134 = $base$addr$1135;$c$8 = $c$6$lcssa;
      label = 72;
     }
    }
   } while(0);
   if ((label|0) == 72) {
    $arrayidx305 = ((3460) + ($c$8)|0);
    $115 = HEAP8[$arrayidx305>>0]|0;
    $conv306 = $115&255;
    $cmp307 = ($conv306>>>0)<($base$addr$1134>>>0);
    if ($cmp307) {
     while(1) {
      $116 = HEAP32[$rpos>>2]|0;
      $117 = HEAP32[$shend>>2]|0;
      $cmp319 = ($116>>>0)<($117>>>0);
      if ($cmp319) {
       $incdec$ptr323 = ((($116)) + 1|0);
       HEAP32[$rpos>>2] = $incdec$ptr323;
       $118 = HEAP8[$116>>0]|0;
       $conv324 = $118&255;
       $c$9$be = $conv324;
      } else {
       $call326 = (___shgetc($f)|0);
       $c$9$be = $call326;
      }
      $arrayidx311 = ((3460) + ($c$9$be)|0);
      $119 = HEAP8[$arrayidx311>>0]|0;
      $conv312 = $119&255;
      $cmp313 = ($conv312>>>0)<($base$addr$1134>>>0);
      if (!($cmp313)) {
       break;
      }
     }
     $call330 = (___errno_location()|0);
     HEAP32[$call330>>2] = 34;
     $120 = $0 & 1;
     $121 = ($120|0)==(0);
     $122 = (0)==(0);
     $123 = $121 & $122;
     $neg$0$ = $123 ? $neg$0 : 0;
     $126 = $1;$128 = $0;$neg$1 = $neg$0$;
    } else {
     $126 = $155;$128 = $154;$neg$1 = $neg$0;
    }
   }
   $124 = HEAP32[$shend>>2]|0;
   $tobool337 = ($124|0)==(0|0);
   if (!($tobool337)) {
    $125 = HEAP32[$rpos>>2]|0;
    $incdec$ptr340 = ((($125)) + -1|0);
    HEAP32[$rpos>>2] = $incdec$ptr340;
   }
   $127 = ($126>>>0)<($1>>>0);
   $129 = ($128>>>0)<($0>>>0);
   $130 = ($126|0)==($1|0);
   $131 = $130 & $129;
   $132 = $127 | $131;
   if (!($132)) {
    $133 = $0 & 1;
    $134 = ($133|0)!=(0);
    $135 = (0)!=(0);
    $136 = $134 | $135;
    $tobool349 = ($neg$1|0)!=(0);
    $or$cond5 = $136 | $tobool349;
    if (!($or$cond5)) {
     $call351 = (___errno_location()|0);
     HEAP32[$call351>>2] = 34;
     $137 = (_i64Add(($0|0),($1|0),-1,-1)|0);
     $138 = tempRet0;
     $150 = $138;$151 = $137;
     break;
    }
    $139 = ($126>>>0)>($1>>>0);
    $140 = ($128>>>0)>($0>>>0);
    $141 = ($126|0)==($1|0);
    $142 = $141 & $140;
    $143 = $139 | $142;
    if ($143) {
     $call357 = (___errno_location()|0);
     HEAP32[$call357>>2] = 34;
     $150 = $1;$151 = $0;
     break;
    }
   }
   $144 = ($neg$1|0)<(0);
   $145 = $144 << 31 >> 31;
   $146 = $128 ^ $neg$1;
   $147 = $126 ^ $145;
   $148 = (_i64Subtract(($146|0),($147|0),($neg$1|0),($145|0))|0);
   $149 = tempRet0;
   $150 = $149;$151 = $148;
  }
 } while(0);
 tempRet0 = ($150);
 return ($151|0);
}
function ___floatscan($f,$prec,$pok) {
 $f = $f|0;
 $prec = $prec|0;
 $pok = $pok|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $arrayidx = 0, $arrayidx95 = 0, $bits$0$ph = 0, $c$0 = 0, $c$1$lcssa = 0;
 var $c$197 = 0, $c$2 = 0, $c$395 = 0, $c$4 = 0, $c$5 = 0, $c$6 = 0, $call = 0, $call113 = 0, $call133 = 0, $call157 = 0, $call189 = 0, $call215 = 0, $call229 = 0, $call23 = 0, $call236 = 0.0, $call246 = 0.0, $call43 = 0, $call6 = 0, $cmp = 0, $cmp101 = 0;
 var $cmp106 = 0, $cmp126 = 0, $cmp136 = 0, $cmp150 = 0, $cmp16 = 0, $cmp161 = 0, $cmp165 = 0, $cmp169 = 0, $cmp172 = 0, $cmp176 = 0, $cmp217 = 0, $cmp222 = 0, $cmp233 = 0, $cmp26 = 0, $cmp29 = 0, $cmp31 = 0, $cmp36 = 0, $cmp53 = 0, $cmp57 = 0, $cmp70 = 0;
 var $cmp70$old = 0, $cmp9 = 0, $cmp91 = 0, $cmp97 = 0, $cond = 0, $cond135 = 0, $cond159 = 0, $cond231 = 0, $conv = 0, $conv111 = 0, $conv12 = 0, $conv131 = 0, $conv155 = 0, $conv21 = 0, $conv227 = 0, $conv28 = 0, $conv41 = 0, $conv84 = 0.0, $conv86 = 0.0, $conv96 = 0;
 var $dec = 0, $dec19293 = 0, $dec19293$in = 0, $emin$0$ph = 0, $i$0$lcssa = 0, $i$096 = 0, $i$1 = 0, $i$294 = 0, $i$3 = 0, $i$4 = 0, $inc = 0, $inc118 = 0, $inc204 = 0, $incdec$ptr = 0, $incdec$ptr110 = 0, $incdec$ptr130 = 0, $incdec$ptr143 = 0, $incdec$ptr154 = 0, $incdec$ptr184 = 0, $incdec$ptr199 = 0;
 var $incdec$ptr20 = 0, $incdec$ptr212 = 0, $incdec$ptr226 = 0, $incdec$ptr242 = 0, $incdec$ptr40 = 0, $incdec$ptr64 = 0, $incdec$ptr77 = 0, $mul = 0, $mul85 = 0.0, $or = 0, $or$cond = 0, $or$cond2 = 0, $or$cond3 = 0, $or$cond4 = 0, $or232 = 0, $or94 = 0, $retval$0 = 0.0, $rpos = 0, $shend = 0, $sign$0 = 0;
 var $sub13 = 0, $sub160 = 0, $sub164 = 0, $sub168 = 0, $tobool = 0, $tobool140 = 0, $tobool181 = 0, $tobool193 = 0, $tobool19392 = 0, $tobool209 = 0, $tobool239 = 0, $tobool55 = 0, $tobool61 = 0, $tobool67 = 0, $tobool88 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 switch ($prec|0) {
 case 0:  {
  $bits$0$ph = 24;$emin$0$ph = -149;
  label = 4;
  break;
 }
 case 1:  {
  $bits$0$ph = 53;$emin$0$ph = -1074;
  label = 4;
  break;
 }
 case 2:  {
  $bits$0$ph = 53;$emin$0$ph = -1074;
  label = 4;
  break;
 }
 default: {
  $retval$0 = 0.0;
 }
 }
 L4: do {
  if ((label|0) == 4) {
   $rpos = ((($f)) + 4|0);
   $shend = ((($f)) + 100|0);
   while(1) {
    $0 = HEAP32[$rpos>>2]|0;
    $1 = HEAP32[$shend>>2]|0;
    $cmp = ($0>>>0)<($1>>>0);
    if ($cmp) {
     $incdec$ptr = ((($0)) + 1|0);
     HEAP32[$rpos>>2] = $incdec$ptr;
     $2 = HEAP8[$0>>0]|0;
     $conv = $2&255;
     $cond = $conv;
    } else {
     $call = (___shgetc($f)|0);
     $cond = $call;
    }
    $call6 = (_isspace($cond)|0);
    $tobool = ($call6|0)==(0);
    if ($tobool) {
     break;
    }
   }
   L13: do {
    switch ($cond|0) {
    case 43: case 45:  {
     $cmp9 = ($cond|0)==(45);
     $conv12 = $cmp9&1;
     $mul = $conv12 << 1;
     $sub13 = (1 - ($mul))|0;
     $3 = HEAP32[$rpos>>2]|0;
     $4 = HEAP32[$shend>>2]|0;
     $cmp16 = ($3>>>0)<($4>>>0);
     if ($cmp16) {
      $incdec$ptr20 = ((($3)) + 1|0);
      HEAP32[$rpos>>2] = $incdec$ptr20;
      $5 = HEAP8[$3>>0]|0;
      $conv21 = $5&255;
      $c$0 = $conv21;$sign$0 = $sub13;
      break L13;
     } else {
      $call23 = (___shgetc($f)|0);
      $c$0 = $call23;$sign$0 = $sub13;
      break L13;
     }
     break;
    }
    default: {
     $c$0 = $cond;$sign$0 = 1;
    }
    }
   } while(0);
   $c$197 = $c$0;$i$096 = 0;
   while(1) {
    $or = $c$197 | 32;
    $arrayidx = (3446 + ($i$096)|0);
    $6 = HEAP8[$arrayidx>>0]|0;
    $conv28 = $6 << 24 >> 24;
    $cmp29 = ($or|0)==($conv28|0);
    if (!($cmp29)) {
     $c$1$lcssa = $c$197;$i$0$lcssa = $i$096;
     break;
    }
    $cmp31 = ($i$096>>>0)<(7);
    do {
     if ($cmp31) {
      $7 = HEAP32[$rpos>>2]|0;
      $8 = HEAP32[$shend>>2]|0;
      $cmp36 = ($7>>>0)<($8>>>0);
      if ($cmp36) {
       $incdec$ptr40 = ((($7)) + 1|0);
       HEAP32[$rpos>>2] = $incdec$ptr40;
       $9 = HEAP8[$7>>0]|0;
       $conv41 = $9&255;
       $c$2 = $conv41;
       break;
      } else {
       $call43 = (___shgetc($f)|0);
       $c$2 = $call43;
       break;
      }
     } else {
      $c$2 = $c$197;
     }
    } while(0);
    $inc = (($i$096) + 1)|0;
    $cmp26 = ($inc>>>0)<(8);
    if ($cmp26) {
     $c$197 = $c$2;$i$096 = $inc;
    } else {
     $c$1$lcssa = $c$2;$i$0$lcssa = $inc;
     break;
    }
   }
   L29: do {
    switch ($i$0$lcssa|0) {
    case 8:  {
     break;
    }
    case 3:  {
     label = 23;
     break;
    }
    default: {
     $cmp53 = ($i$0$lcssa>>>0)>(3);
     $tobool55 = ($pok|0)!=(0);
     $or$cond2 = $tobool55 & $cmp53;
     if ($or$cond2) {
      $cmp57 = ($i$0$lcssa|0)==(8);
      if ($cmp57) {
       break L29;
      } else {
       label = 23;
       break L29;
      }
     }
     $tobool88 = ($i$0$lcssa|0)==(0);
     L34: do {
      if ($tobool88) {
       $c$395 = $c$1$lcssa;$i$294 = 0;
       while(1) {
        $or94 = $c$395 | 32;
        $arrayidx95 = (3455 + ($i$294)|0);
        $13 = HEAP8[$arrayidx95>>0]|0;
        $conv96 = $13 << 24 >> 24;
        $cmp97 = ($or94|0)==($conv96|0);
        if (!($cmp97)) {
         $c$5 = $c$395;$i$3 = $i$294;
         break L34;
        }
        $cmp101 = ($i$294>>>0)<(2);
        do {
         if ($cmp101) {
          $14 = HEAP32[$rpos>>2]|0;
          $15 = HEAP32[$shend>>2]|0;
          $cmp106 = ($14>>>0)<($15>>>0);
          if ($cmp106) {
           $incdec$ptr110 = ((($14)) + 1|0);
           HEAP32[$rpos>>2] = $incdec$ptr110;
           $16 = HEAP8[$14>>0]|0;
           $conv111 = $16&255;
           $c$4 = $conv111;
           break;
          } else {
           $call113 = (___shgetc($f)|0);
           $c$4 = $call113;
           break;
          }
         } else {
          $c$4 = $c$395;
         }
        } while(0);
        $inc118 = (($i$294) + 1)|0;
        $cmp91 = ($inc118>>>0)<(3);
        if ($cmp91) {
         $c$395 = $c$4;$i$294 = $inc118;
        } else {
         $c$5 = $c$4;$i$3 = $inc118;
         break;
        }
       }
      } else {
       $c$5 = $c$1$lcssa;$i$3 = $i$0$lcssa;
      }
     } while(0);
     switch ($i$3|0) {
     case 3:  {
      $17 = HEAP32[$rpos>>2]|0;
      $18 = HEAP32[$shend>>2]|0;
      $cmp126 = ($17>>>0)<($18>>>0);
      if ($cmp126) {
       $incdec$ptr130 = ((($17)) + 1|0);
       HEAP32[$rpos>>2] = $incdec$ptr130;
       $19 = HEAP8[$17>>0]|0;
       $conv131 = $19&255;
       $cond135 = $conv131;
      } else {
       $call133 = (___shgetc($f)|0);
       $cond135 = $call133;
      }
      $cmp136 = ($cond135|0)==(40);
      if ($cmp136) {
       $i$4 = 1;
      } else {
       $20 = HEAP32[$shend>>2]|0;
       $tobool140 = ($20|0)==(0|0);
       if ($tobool140) {
        $retval$0 = nan;
        break L4;
       }
       $21 = HEAP32[$rpos>>2]|0;
       $incdec$ptr143 = ((($21)) + -1|0);
       HEAP32[$rpos>>2] = $incdec$ptr143;
       $retval$0 = nan;
       break L4;
      }
      while(1) {
       $22 = HEAP32[$rpos>>2]|0;
       $23 = HEAP32[$shend>>2]|0;
       $cmp150 = ($22>>>0)<($23>>>0);
       if ($cmp150) {
        $incdec$ptr154 = ((($22)) + 1|0);
        HEAP32[$rpos>>2] = $incdec$ptr154;
        $24 = HEAP8[$22>>0]|0;
        $conv155 = $24&255;
        $cond159 = $conv155;
       } else {
        $call157 = (___shgetc($f)|0);
        $cond159 = $call157;
       }
       $sub160 = (($cond159) + -48)|0;
       $cmp161 = ($sub160>>>0)<(10);
       $sub164 = (($cond159) + -65)|0;
       $cmp165 = ($sub164>>>0)<(26);
       $or$cond = $cmp161 | $cmp165;
       if (!($or$cond)) {
        $sub168 = (($cond159) + -97)|0;
        $cmp169 = ($sub168>>>0)<(26);
        $cmp172 = ($cond159|0)==(95);
        $or$cond3 = $cmp172 | $cmp169;
        if (!($or$cond3)) {
         break;
        }
       }
       $inc204 = (($i$4) + 1)|0;
       $i$4 = $inc204;
      }
      $cmp176 = ($cond159|0)==(41);
      if ($cmp176) {
       $retval$0 = nan;
       break L4;
      }
      $25 = HEAP32[$shend>>2]|0;
      $tobool181 = ($25|0)==(0|0);
      if (!($tobool181)) {
       $26 = HEAP32[$rpos>>2]|0;
       $incdec$ptr184 = ((($26)) + -1|0);
       HEAP32[$rpos>>2] = $incdec$ptr184;
      }
      if (!($tobool55)) {
       $call189 = (___errno_location()|0);
       HEAP32[$call189>>2] = 22;
       ___shlim($f,0);
       $retval$0 = 0.0;
       break L4;
      }
      $tobool19392 = ($i$4|0)==(0);
      if ($tobool19392) {
       $retval$0 = nan;
       break L4;
      } else {
       $dec19293$in = $i$4;
      }
      while(1) {
       $dec19293 = (($dec19293$in) + -1)|0;
       if (!($tobool181)) {
        $27 = HEAP32[$rpos>>2]|0;
        $incdec$ptr199 = ((($27)) + -1|0);
        HEAP32[$rpos>>2] = $incdec$ptr199;
       }
       $tobool193 = ($dec19293|0)==(0);
       if ($tobool193) {
        $retval$0 = nan;
        break L4;
       } else {
        $dec19293$in = $dec19293;
       }
      }
      break;
     }
     case 0:  {
      $cmp217 = ($c$5|0)==(48);
      if ($cmp217) {
       $30 = HEAP32[$rpos>>2]|0;
       $31 = HEAP32[$shend>>2]|0;
       $cmp222 = ($30>>>0)<($31>>>0);
       if ($cmp222) {
        $incdec$ptr226 = ((($30)) + 1|0);
        HEAP32[$rpos>>2] = $incdec$ptr226;
        $32 = HEAP8[$30>>0]|0;
        $conv227 = $32&255;
        $cond231 = $conv227;
       } else {
        $call229 = (___shgetc($f)|0);
        $cond231 = $call229;
       }
       $or232 = $cond231 | 32;
       $cmp233 = ($or232|0)==(120);
       if ($cmp233) {
        $call236 = (+_hexfloat($f,$bits$0$ph,$emin$0$ph,$sign$0,$pok));
        $retval$0 = $call236;
        break L4;
       }
       $33 = HEAP32[$shend>>2]|0;
       $tobool239 = ($33|0)==(0|0);
       if ($tobool239) {
        $c$6 = 48;
       } else {
        $34 = HEAP32[$rpos>>2]|0;
        $incdec$ptr242 = ((($34)) + -1|0);
        HEAP32[$rpos>>2] = $incdec$ptr242;
        $c$6 = 48;
       }
      } else {
       $c$6 = $c$5;
      }
      $call246 = (+_decfloat($f,$c$6,$bits$0$ph,$emin$0$ph,$sign$0,$pok));
      $retval$0 = $call246;
      break L4;
      break;
     }
     default: {
      $28 = HEAP32[$shend>>2]|0;
      $tobool209 = ($28|0)==(0|0);
      if (!($tobool209)) {
       $29 = HEAP32[$rpos>>2]|0;
       $incdec$ptr212 = ((($29)) + -1|0);
       HEAP32[$rpos>>2] = $incdec$ptr212;
      }
      $call215 = (___errno_location()|0);
      HEAP32[$call215>>2] = 22;
      ___shlim($f,0);
      $retval$0 = 0.0;
      break L4;
     }
     }
    }
    }
   } while(0);
   if ((label|0) == 23) {
    $10 = HEAP32[$shend>>2]|0;
    $tobool61 = ($10|0)==(0|0);
    if (!($tobool61)) {
     $11 = HEAP32[$rpos>>2]|0;
     $incdec$ptr64 = ((($11)) + -1|0);
     HEAP32[$rpos>>2] = $incdec$ptr64;
    }
    $tobool67 = ($pok|0)!=(0);
    $cmp70 = ($i$0$lcssa>>>0)>(3);
    $or$cond4 = $tobool67 & $cmp70;
    if ($or$cond4) {
     $i$1 = $i$0$lcssa;
     while(1) {
      if (!($tobool61)) {
       $12 = HEAP32[$rpos>>2]|0;
       $incdec$ptr77 = ((($12)) + -1|0);
       HEAP32[$rpos>>2] = $incdec$ptr77;
      }
      $dec = (($i$1) + -1)|0;
      $cmp70$old = ($dec>>>0)>(3);
      if ($cmp70$old) {
       $i$1 = $dec;
      } else {
       break;
      }
     }
    }
   }
   $conv84 = (+($sign$0|0));
   $mul85 = $conv84 * inf;
   $conv86 = $mul85;
   $retval$0 = $conv86;
  }
 } while(0);
 return (+$retval$0);
}
function _hexfloat($f,$bits,$emin,$sign,$pok) {
 $f = $f|0;
 $bits = $bits|0;
 $emin = $emin|0;
 $sign = $sign|0;
 $pok = $pok|0;
 var $$pre = 0.0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0;
 var $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0;
 var $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0;
 var $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0;
 var $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0;
 var $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $add210 = 0, $add214 = 0, $add256 = 0.0, $add259 = 0.0, $add73 = 0, $add80 = 0.0, $add86 = 0.0, $and = 0, $bias$0 = 0.0;
 var $bits$addr$0 = 0, $bits$addr$0108 = 0, $bits$addr$0109 = 0, $c$0 = 0, $c$1$ph = 0, $c$2 = 0, $c$2$lcssa = 0, $call = 0, $call101 = 0, $call13 = 0, $call187 = 0, $call197 = 0, $call240 = 0.0, $call242 = 0.0, $call263 = 0, $call266 = 0.0, $call27 = 0, $call44 = 0, $cmp = 0, $cmp146 = 0;
 var $cmp20 = 0, $cmp203 = 0, $cmp203115 = 0, $cmp206 = 0, $cmp235 = 0, $cmp244 = 0, $cmp31 = 0, $cmp31125 = 0, $cmp37 = 0, $cmp49 = 0, $cmp52 = 0, $cmp57 = 0, $cmp6 = 0, $cmp62 = 0, $cmp94 = 0, $cond46 = 0, $conv = 0, $conv11 = 0, $conv135 = 0.0, $conv179 = 0.0;
 var $conv188 = 0.0, $conv198 = 0.0, $conv241111 = 0.0, $conv25 = 0, $conv253$pre$phiZ2D = 0.0, $conv254 = 0.0, $conv42 = 0, $conv78 = 0.0, $conv99 = 0, $d$0 = 0, $div = 0.0, $gotdig$0 = 0, $gotdig$2 = 0, $gotdig$3 = 0, $gotrad$0 = 0, $gotrad$1 = 0, $gottail$0 = 0, $gottail$0$ = 0, $gottail$1 = 0, $gottail$2 = 0;
 var $inc251 = 0, $incdec$ptr = 0, $incdec$ptr10 = 0, $incdec$ptr111 = 0, $incdec$ptr120 = 0, $incdec$ptr129 = 0, $incdec$ptr159 = 0, $incdec$ptr170 = 0, $incdec$ptr24 = 0, $incdec$ptr41 = 0, $incdec$ptr98 = 0, $mul = 0, $mul136 = 0.0, $mul143 = 0, $mul180 = 0.0, $mul189 = 0.0, $mul190 = 0.0, $mul199 = 0.0, $mul200 = 0.0, $mul255 = 0.0;
 var $mul258 = 0.0, $mul79 = 0.0, $mul85 = 0.0, $not$cmp206 = 0, $or = 0, $or$cond = 0, $or$cond103 = 0, $or$cond136 = 0, $or$cond2 = 0, $or$cond3 = 0, $or145 = 0, $or65 = 0, $retval$0 = 0.0, $rpos = 0, $scale$0 = 0.0, $scale$1 = 0.0, $scale$2 = 0.0, $shend = 0, $sub = 0, $sub182 = 0;
 var $sub192 = 0, $sub211 = 0.0, $sub211$pn = 0.0, $sub239 = 0, $sub239110 = 0, $sub260 = 0.0, $sub51 = 0, $sub66 = 0, $tobool = 0, $tobool105 = 0, $tobool108 = 0, $tobool114 = 0, $tobool123 = 0, $tobool126 = 0, $tobool138 = 0, $tobool153 = 0, $tobool156 = 0, $tobool167 = 0, $tobool177 = 0, $tobool247 = 0;
 var $tobool249 = 0, $tobool261 = 0, $tobool82 = 0, $tobool83 = 0, $x$0 = 0, $x$1 = 0, $x$2 = 0, $x$3$lcssa = 0, $x$3122 = 0, $x$4$lcssa = 0, $x$4116 = 0, $x$5 = 0, $x$6 = 0, $y$0 = 0.0, $y$0$add86 = 0.0, $y$1 = 0.0, $y$2 = 0.0, $y$3$lcssa = 0.0, $y$3117 = 0.0, $y$4 = 0.0;
 var $y$5 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $rpos = ((($f)) + 4|0);
 $0 = HEAP32[$rpos>>2]|0;
 $shend = ((($f)) + 100|0);
 $1 = HEAP32[$shend>>2]|0;
 $cmp = ($0>>>0)<($1>>>0);
 if ($cmp) {
  $incdec$ptr = ((($0)) + 1|0);
  HEAP32[$rpos>>2] = $incdec$ptr;
  $2 = HEAP8[$0>>0]|0;
  $conv = $2&255;
  $c$0 = $conv;$gotdig$0 = 0;
 } else {
  $call = (___shgetc($f)|0);
  $c$0 = $call;$gotdig$0 = 0;
 }
 L4: while(1) {
  switch ($c$0|0) {
  case 46:  {
   label = 8;
   break L4;
   break;
  }
  case 48:  {
   break;
  }
  default: {
   $16 = 0;$18 = 0;$37 = 0;$39 = 0;$c$2 = $c$0;$gotdig$2 = $gotdig$0;$gotrad$0 = 0;$gottail$0 = 0;$scale$0 = 1.0;$x$0 = 0;$y$0 = 0.0;
   break L4;
  }
  }
  $3 = HEAP32[$rpos>>2]|0;
  $4 = HEAP32[$shend>>2]|0;
  $cmp6 = ($3>>>0)<($4>>>0);
  if ($cmp6) {
   $incdec$ptr10 = ((($3)) + 1|0);
   HEAP32[$rpos>>2] = $incdec$ptr10;
   $5 = HEAP8[$3>>0]|0;
   $conv11 = $5&255;
   $c$0 = $conv11;$gotdig$0 = 1;
   continue;
  } else {
   $call13 = (___shgetc($f)|0);
   $c$0 = $call13;$gotdig$0 = 1;
   continue;
  }
 }
 if ((label|0) == 8) {
  $6 = HEAP32[$rpos>>2]|0;
  $7 = HEAP32[$shend>>2]|0;
  $cmp20 = ($6>>>0)<($7>>>0);
  if ($cmp20) {
   $incdec$ptr24 = ((($6)) + 1|0);
   HEAP32[$rpos>>2] = $incdec$ptr24;
   $8 = HEAP8[$6>>0]|0;
   $conv25 = $8&255;
   $c$1$ph = $conv25;
  } else {
   $call27 = (___shgetc($f)|0);
   $c$1$ph = $call27;
  }
  $cmp31125 = ($c$1$ph|0)==(48);
  if ($cmp31125) {
   $12 = 0;$13 = 0;
   while(1) {
    $9 = HEAP32[$rpos>>2]|0;
    $10 = HEAP32[$shend>>2]|0;
    $cmp37 = ($9>>>0)<($10>>>0);
    if ($cmp37) {
     $incdec$ptr41 = ((($9)) + 1|0);
     HEAP32[$rpos>>2] = $incdec$ptr41;
     $11 = HEAP8[$9>>0]|0;
     $conv42 = $11&255;
     $cond46 = $conv42;
    } else {
     $call44 = (___shgetc($f)|0);
     $cond46 = $call44;
    }
    $14 = (_i64Add(($12|0),($13|0),-1,-1)|0);
    $15 = tempRet0;
    $cmp31 = ($cond46|0)==(48);
    if ($cmp31) {
     $12 = $14;$13 = $15;
    } else {
     $16 = 0;$18 = 0;$37 = $14;$39 = $15;$c$2 = $cond46;$gotdig$2 = 1;$gotrad$0 = 1;$gottail$0 = 0;$scale$0 = 1.0;$x$0 = 0;$y$0 = 0.0;
     break;
    }
   }
  } else {
   $16 = 0;$18 = 0;$37 = 0;$39 = 0;$c$2 = $c$1$ph;$gotdig$2 = $gotdig$0;$gotrad$0 = 1;$gottail$0 = 0;$scale$0 = 1.0;$x$0 = 0;$y$0 = 0.0;
  }
 }
 while(1) {
  $sub = (($c$2) + -48)|0;
  $cmp49 = ($sub>>>0)<(10);
  $cmp57 = ($c$2|0)==(46);
  if (!($cmp49)) {
   $or = $c$2 | 32;
   $sub51 = (($or) + -97)|0;
   $cmp52 = ($sub51>>>0)<(6);
   $or$cond3 = $cmp57 | $cmp52;
   if (!($or$cond3)) {
    $c$2$lcssa = $c$2;
    break;
   }
  }
  if ($cmp57) {
   $tobool = ($gotrad$0|0)==(0);
   if ($tobool) {
    $106 = $18;$107 = $16;$108 = $18;$109 = $16;$gotdig$3 = $gotdig$2;$gotrad$1 = 1;$gottail$2 = $gottail$0;$scale$2 = $scale$0;$x$2 = $x$0;$y$2 = $y$0;
   } else {
    $c$2$lcssa = 46;
    break;
   }
  } else {
   $cmp62 = ($c$2|0)>(57);
   $or65 = $c$2 | 32;
   $sub66 = (($or65) + -87)|0;
   $d$0 = $cmp62 ? $sub66 : $sub;
   $17 = ($16|0)<(0);
   $19 = ($18>>>0)<(8);
   $20 = ($16|0)==(0);
   $21 = $20 & $19;
   $22 = $17 | $21;
   do {
    if ($22) {
     $mul = $x$0 << 4;
     $add73 = (($d$0) + ($mul))|0;
     $gottail$1 = $gottail$0;$scale$1 = $scale$0;$x$1 = $add73;$y$1 = $y$0;
    } else {
     $23 = ($16|0)<(0);
     $24 = ($18>>>0)<(14);
     $25 = ($16|0)==(0);
     $26 = $25 & $24;
     $27 = $23 | $26;
     if ($27) {
      $conv78 = (+($d$0|0));
      $div = $scale$0 * 0.0625;
      $mul79 = $div * $conv78;
      $add80 = $y$0 + $mul79;
      $gottail$1 = $gottail$0;$scale$1 = $div;$x$1 = $x$0;$y$1 = $add80;
      break;
     } else {
      $tobool82 = ($d$0|0)==(0);
      $tobool83 = ($gottail$0|0)!=(0);
      $or$cond = $tobool83 | $tobool82;
      $mul85 = $scale$0 * 0.5;
      $add86 = $y$0 + $mul85;
      $y$0$add86 = $or$cond ? $y$0 : $add86;
      $gottail$0$ = $or$cond ? $gottail$0 : 1;
      $gottail$1 = $gottail$0$;$scale$1 = $scale$0;$x$1 = $x$0;$y$1 = $y$0$add86;
      break;
     }
    }
   } while(0);
   $28 = (_i64Add(($18|0),($16|0),1,0)|0);
   $29 = tempRet0;
   $106 = $37;$107 = $39;$108 = $28;$109 = $29;$gotdig$3 = 1;$gotrad$1 = $gotrad$0;$gottail$2 = $gottail$1;$scale$2 = $scale$1;$x$2 = $x$1;$y$2 = $y$1;
  }
  $30 = HEAP32[$rpos>>2]|0;
  $31 = HEAP32[$shend>>2]|0;
  $cmp94 = ($30>>>0)<($31>>>0);
  if ($cmp94) {
   $incdec$ptr98 = ((($30)) + 1|0);
   HEAP32[$rpos>>2] = $incdec$ptr98;
   $32 = HEAP8[$30>>0]|0;
   $conv99 = $32&255;
   $16 = $109;$18 = $108;$37 = $106;$39 = $107;$c$2 = $conv99;$gotdig$2 = $gotdig$3;$gotrad$0 = $gotrad$1;$gottail$0 = $gottail$2;$scale$0 = $scale$2;$x$0 = $x$2;$y$0 = $y$2;
   continue;
  } else {
   $call101 = (___shgetc($f)|0);
   $16 = $109;$18 = $108;$37 = $106;$39 = $107;$c$2 = $call101;$gotdig$2 = $gotdig$3;$gotrad$0 = $gotrad$1;$gottail$0 = $gottail$2;$scale$0 = $scale$2;$x$0 = $x$2;$y$0 = $y$2;
   continue;
  }
 }
 $tobool105 = ($gotdig$2|0)==(0);
 do {
  if ($tobool105) {
   $33 = HEAP32[$shend>>2]|0;
   $tobool108 = ($33|0)!=(0|0);
   if ($tobool108) {
    $34 = HEAP32[$rpos>>2]|0;
    $incdec$ptr111 = ((($34)) + -1|0);
    HEAP32[$rpos>>2] = $incdec$ptr111;
   }
   $tobool114 = ($pok|0)==(0);
   if ($tobool114) {
    ___shlim($f,0);
   } else {
    if ($tobool108) {
     $35 = HEAP32[$rpos>>2]|0;
     $incdec$ptr120 = ((($35)) + -1|0);
     HEAP32[$rpos>>2] = $incdec$ptr120;
    }
    $tobool123 = ($gotrad$0|0)==(0);
    $tobool126 = ($33|0)==(0|0);
    $or$cond136 = $tobool123 | $tobool126;
    if (!($or$cond136)) {
     $36 = HEAP32[$rpos>>2]|0;
     $incdec$ptr129 = ((($36)) + -1|0);
     HEAP32[$rpos>>2] = $incdec$ptr129;
    }
   }
   $conv135 = (+($sign|0));
   $mul136 = $conv135 * 0.0;
   $retval$0 = $mul136;
  } else {
   $tobool138 = ($gotrad$0|0)==(0);
   $38 = $tobool138 ? $18 : $37;
   $40 = $tobool138 ? $16 : $39;
   $41 = ($16|0)<(0);
   $42 = ($18>>>0)<(8);
   $43 = ($16|0)==(0);
   $44 = $43 & $42;
   $45 = $41 | $44;
   if ($45) {
    $46 = $18;$47 = $16;$x$3122 = $x$0;
    while(1) {
     $mul143 = $x$3122 << 4;
     $48 = (_i64Add(($46|0),($47|0),1,0)|0);
     $49 = tempRet0;
     $50 = ($49|0)<(0);
     $51 = ($48>>>0)<(8);
     $52 = ($49|0)==(0);
     $53 = $52 & $51;
     $54 = $50 | $53;
     if ($54) {
      $46 = $48;$47 = $49;$x$3122 = $mul143;
     } else {
      $x$3$lcssa = $mul143;
      break;
     }
    }
   } else {
    $x$3$lcssa = $x$0;
   }
   $or145 = $c$2$lcssa | 32;
   $cmp146 = ($or145|0)==(112);
   if ($cmp146) {
    $55 = (_scanexp($f,$pok)|0);
    $56 = tempRet0;
    $57 = ($55|0)==(0);
    $58 = ($56|0)==(-2147483648);
    $59 = $57 & $58;
    if ($59) {
     $tobool153 = ($pok|0)==(0);
     if ($tobool153) {
      ___shlim($f,0);
      $retval$0 = 0.0;
      break;
     }
     $60 = HEAP32[$shend>>2]|0;
     $tobool156 = ($60|0)==(0|0);
     if ($tobool156) {
      $68 = 0;$69 = 0;
     } else {
      $61 = HEAP32[$rpos>>2]|0;
      $incdec$ptr159 = ((($61)) + -1|0);
      HEAP32[$rpos>>2] = $incdec$ptr159;
      $68 = 0;$69 = 0;
     }
    } else {
     $68 = $55;$69 = $56;
    }
   } else {
    $62 = HEAP32[$shend>>2]|0;
    $tobool167 = ($62|0)==(0|0);
    if ($tobool167) {
     $68 = 0;$69 = 0;
    } else {
     $63 = HEAP32[$rpos>>2]|0;
     $incdec$ptr170 = ((($63)) + -1|0);
     HEAP32[$rpos>>2] = $incdec$ptr170;
     $68 = 0;$69 = 0;
    }
   }
   $64 = (_bitshift64Shl(($38|0),($40|0),2)|0);
   $65 = tempRet0;
   $66 = (_i64Add(($64|0),($65|0),-32,-1)|0);
   $67 = tempRet0;
   $70 = (_i64Add(($66|0),($67|0),($68|0),($69|0))|0);
   $71 = tempRet0;
   $tobool177 = ($x$3$lcssa|0)==(0);
   if ($tobool177) {
    $conv179 = (+($sign|0));
    $mul180 = $conv179 * 0.0;
    $retval$0 = $mul180;
    break;
   }
   $sub182 = (0 - ($emin))|0;
   $72 = ($sub182|0)<(0);
   $73 = $72 << 31 >> 31;
   $74 = ($71|0)>($73|0);
   $75 = ($70>>>0)>($sub182>>>0);
   $76 = ($71|0)==($73|0);
   $77 = $76 & $75;
   $78 = $74 | $77;
   if ($78) {
    $call187 = (___errno_location()|0);
    HEAP32[$call187>>2] = 34;
    $conv188 = (+($sign|0));
    $mul189 = $conv188 * 1.7976931348623157E+308;
    $mul190 = $mul189 * 1.7976931348623157E+308;
    $retval$0 = $mul190;
    break;
   }
   $sub192 = (($emin) + -106)|0;
   $79 = ($sub192|0)<(0);
   $80 = $79 << 31 >> 31;
   $81 = ($71|0)<($80|0);
   $82 = ($70>>>0)<($sub192>>>0);
   $83 = ($71|0)==($80|0);
   $84 = $83 & $82;
   $85 = $81 | $84;
   if ($85) {
    $call197 = (___errno_location()|0);
    HEAP32[$call197>>2] = 34;
    $conv198 = (+($sign|0));
    $mul199 = $conv198 * 2.2250738585072014E-308;
    $mul200 = $mul199 * 2.2250738585072014E-308;
    $retval$0 = $mul200;
    break;
   }
   $cmp203115 = ($x$3$lcssa|0)>(-1);
   if ($cmp203115) {
    $86 = $70;$87 = $71;$x$4116 = $x$3$lcssa;$y$3117 = $y$0;
    while(1) {
     $cmp206 = !($y$3117 >= 0.5);
     $add214 = $x$4116 << 1;
     $sub211 = $y$3117 + -1.0;
     $not$cmp206 = $cmp206 ^ 1;
     $add210 = $not$cmp206&1;
     $x$5 = $add214 | $add210;
     $sub211$pn = $cmp206 ? $y$3117 : $sub211;
     $y$4 = $y$3117 + $sub211$pn;
     $88 = (_i64Add(($86|0),($87|0),-1,-1)|0);
     $89 = tempRet0;
     $cmp203 = ($x$5|0)>(-1);
     if ($cmp203) {
      $86 = $88;$87 = $89;$x$4116 = $x$5;$y$3117 = $y$4;
     } else {
      $96 = $88;$97 = $89;$x$4$lcssa = $x$5;$y$3$lcssa = $y$4;
      break;
     }
    }
   } else {
    $96 = $70;$97 = $71;$x$4$lcssa = $x$3$lcssa;$y$3$lcssa = $y$0;
   }
   $90 = ($bits|0)<(0);
   $91 = $90 << 31 >> 31;
   $92 = ($emin|0)<(0);
   $93 = $92 << 31 >> 31;
   $94 = (_i64Subtract(32,0,($emin|0),($93|0))|0);
   $95 = tempRet0;
   $98 = (_i64Add(($94|0),($95|0),($96|0),($97|0))|0);
   $99 = tempRet0;
   $100 = ($91|0)>($99|0);
   $101 = ($bits>>>0)>($98>>>0);
   $102 = ($91|0)==($99|0);
   $103 = $102 & $101;
   $104 = $100 | $103;
   if ($104) {
    $105 = ($98|0)>(0);
    if ($105) {
     $bits$addr$0 = $98;
     label = 59;
    } else {
     $bits$addr$0109 = 0;$sub239110 = 84;
     label = 61;
    }
   } else {
    $bits$addr$0 = $bits;
    label = 59;
   }
   if ((label|0) == 59) {
    $cmp235 = ($bits$addr$0|0)<(53);
    $sub239 = (84 - ($bits$addr$0))|0;
    if ($cmp235) {
     $bits$addr$0109 = $bits$addr$0;$sub239110 = $sub239;
     label = 61;
    } else {
     $$pre = (+($sign|0));
     $bias$0 = 0.0;$bits$addr$0108 = $bits$addr$0;$conv253$pre$phiZ2D = $$pre;
    }
   }
   if ((label|0) == 61) {
    $conv241111 = (+($sign|0));
    $call240 = (+_scalbn(1.0,$sub239110));
    $call242 = (+_copysignl($call240,$conv241111));
    $bias$0 = $call242;$bits$addr$0108 = $bits$addr$0109;$conv253$pre$phiZ2D = $conv241111;
   }
   $cmp244 = ($bits$addr$0108|0)<(32);
   $tobool247 = $y$3$lcssa != 0.0;
   $or$cond2 = $tobool247 & $cmp244;
   $and = $x$4$lcssa & 1;
   $tobool249 = ($and|0)==(0);
   $or$cond103 = $tobool249 & $or$cond2;
   $inc251 = $or$cond103&1;
   $x$6 = (($inc251) + ($x$4$lcssa))|0;
   $y$5 = $or$cond103 ? 0.0 : $y$3$lcssa;
   $conv254 = (+($x$6>>>0));
   $mul255 = $conv253$pre$phiZ2D * $conv254;
   $add256 = $bias$0 + $mul255;
   $mul258 = $conv253$pre$phiZ2D * $y$5;
   $add259 = $mul258 + $add256;
   $sub260 = $add259 - $bias$0;
   $tobool261 = $sub260 != 0.0;
   if (!($tobool261)) {
    $call263 = (___errno_location()|0);
    HEAP32[$call263>>2] = 34;
   }
   $call266 = (+_scalbnl($sub260,$96));
   $retval$0 = $call266;
  }
 } while(0);
 return (+$retval$0);
}
function _decfloat($f,$c,$bits,$emin,$sign,$pok) {
 $f = $f|0;
 $c = $c|0;
 $bits = $bits|0;
 $emin = $emin|0;
 $sign = $sign|0;
 $pok = $pok|0;
 var $$264 = 0, $$inc66 = 0, $$neg = 0, $$pre = 0, $$sub489 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0;
 var $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $a$0$lcssa380 = 0, $a$0329 = 0, $a$2$ph288 = 0, $a$4 = 0, $a$4$ph = 0, $a$4$ph386 = 0, $a$5322 = 0, $add252 = 0, $add265 = 0, $add275 = 0, $add287 = 0, $add309$sink$off0 = 0, $add347 = 0, $add371 = 0, $add404 = 0, $add417 = 0, $add427 = 0, $add433 = 0;
 var $add438 = 0, $add462 = 0, $add467 = 0, $add477 = 0.0, $add483 = 0, $add506 = 0.0, $add508 = 0, $add523 = 0, $add530 = 0.0, $add537 = 0.0, $add543 = 0, $add550 = 0.0, $add554 = 0.0, $add569 = 0.0, $add59 = 0, $and = 0, $and$a$0 = 0, $and323 = 0, $and349 = 0, $and354 = 0;
 var $and357 = 0, $and372 = 0, $and414 = 0, $and428 = 0, $and428$a$5 = 0, $and434 = 0, $and439 = 0, $and448 = 0, $and463 = 0, $and468 = 0, $and509 = 0, $and524 = 0, $and544 = 0, $and572 = 0, $arrayidx186 = 0, $arrayidx186$promoted = 0, $arrayidx219 = 0, $arrayidx239 = 0, $arrayidx256 = 0, $arrayidx261 = 0;
 var $arrayidx284 = 0, $arrayidx294 = 0, $arrayidx306 = 0, $arrayidx355 = 0, $arrayidx358 = 0, $arrayidx361 = 0, $arrayidx376 = 0, $arrayidx377 = 0, $arrayidx411 = 0, $arrayidx443 = 0, $arrayidx449 = 0, $arrayidx470 = 0, $arrayidx475 = 0, $arrayidx516 = 0, $arrayidx77 = 0, $bias$0 = 0.0, $bits$addr$0 = 0, $c$addr$0 = 0, $c$addr$1$be = 0, $c$addr$1$ph = 0;
 var $c$addr$2 = 0, $c$addr$3$be = 0, $c$addr$3$lcssa = 0, $c$addr$3348 = 0, $call = 0, $call135 = 0, $call15 = 0, $call165 = 0, $call175 = 0, $call32 = 0, $call500 = 0.0, $call501 = 0.0, $call503 = 0.0, $call504 = 0.0, $call563 = 0.0, $call577 = 0.0, $call600 = 0, $call603 = 0.0, $call91 = 0, $carry$0331 = 0;
 var $carry299$0 = 0, $carry299$1 = 0, $carry365$0324 = 0, $cmp100 = 0, $cmp121 = 0, $cmp149 = 0, $cmp152 = 0, $cmp183335 = 0, $cmp19 = 0, $cmp19359 = 0, $cmp194 = 0, $cmp197 = 0, $cmp2 = 0, $cmp200 = 0, $cmp203 = 0, $cmp211 = 0, $cmp226 = 0, $cmp231 = 0, $cmp246 = 0, $cmp25 = 0;
 var $cmp258 = 0, $cmp258327 = 0, $cmp269 = 0, $cmp289 = 0, $cmp292 = 0, $cmp295 = 0, $cmp324 = 0, $cmp327 = 0, $cmp350 = 0, $cmp368 = 0, $cmp373 = 0, $cmp378 = 0, $cmp38 = 0, $cmp38339 = 0, $cmp386 = 0, $cmp393 = 0, $cmp396 = 0, $cmp40 = 0, $cmp400 = 0, $cmp40340 = 0;
 var $cmp40350 = 0, $cmp406 = 0, $cmp406320 = 0, $cmp421 = 0, $cmp440 = 0, $cmp464 = 0, $cmp48 = 0, $cmp485 = 0, $cmp495 = 0, $cmp51 = 0, $cmp510 = 0, $cmp517 = 0, $cmp525 = 0, $cmp532 = 0, $cmp545 = 0, $cmp560 = 0, $cmp574 = 0, $cmp578 = 0, $cmp593 = 0, $cmp67 = 0;
 var $cmp8 = 0, $cmp84 = 0, $cond = 0, $cond254 = 0, $conv = 0, $conv13 = 0, $conv140 = 0.0, $conv155 = 0.0, $conv157 = 0.0, $conv166 = 0.0, $conv176 = 0.0, $conv206 = 0.0, $conv208 = 0.0, $conv214 = 0.0, $conv216 = 0.0, $conv220 = 0.0, $conv234 = 0.0, $conv236 = 0.0, $conv240 = 0.0, $conv30 = 0;
 var $conv476 = 0.0, $conv481 = 0.0, $conv54$lnz$0 = 0, $conv89 = 0, $denormal$2$v = 0, $div = 0, $div221 = 0.0, $div264 = 0, $div267 = 0, $e2$0 = 0, $e2$0$ph = 0, $e2$1 = 0, $e2$1$ph = 0, $e2$1$ph385 = 0, $e2$3 = 0, $e2$4 = 0, $exitcond = 0, $exitcond377 = 0, $frac$0 = 0.0, $frac$1 = 0.0;
 var $frac$3 = 0.0, $gotdig$0 = 0, $gotdig$2 = 0, $gotdig$3$lcssa = 0, $gotdig$3344 = 0, $gotdig$4 = 0, $gotrad$0 = 0, $gotrad$1$lcssa = 0, $gotrad$1345 = 0, $gotrad$2 = 0, $i$0319 = 0, $i$1 = 0, $i$4318 = 0, $inc189 = 0, $inc191 = 0, $inc279 = 0, $inc283 = 0, $inc391 = 0, $inc479 = 0, $inc566 = 0.0;
 var $inc590 = 0, $inc66 = 0, $inc70 = 0, $inc70$k$0 = 0, $incdec$ptr = 0, $incdec$ptr113 = 0, $incdec$ptr12 = 0, $incdec$ptr128 = 0, $incdec$ptr29 = 0, $incdec$ptr88 = 0, $j$0$lcssa = 0, $j$0296 = 0, $j$0297 = 0, $j$0298 = 0, $j$0347 = 0, $j$2 = 0, $j$3336 = 0, $k$0$lcssa = 0, $k$0300 = 0, $k$0301 = 0;
 var $k$0302 = 0, $k$0346 = 0, $k$2 = 0, $k$3 = 0, $k$4330 = 0, $k$5 = 0, $k$5$in = 0, $k$6323 = 0, $lnz$0$lcssa = 0, $lnz$0306 = 0, $lnz$0307 = 0, $lnz$0308 = 0, $lnz$0343 = 0, $lnz$2 = 0, $mul = 0, $mul141 = 0.0, $mul158 = 0.0, $mul167 = 0.0, $mul168 = 0.0, $mul177 = 0.0;
 var $mul178 = 0.0, $mul187 = 0, $mul187337 = 0, $mul209 = 0.0, $mul217 = 0.0, $mul224$neg = 0, $mul237 = 0.0, $mul241 = 0.0, $mul268 = 0, $mul420 = 0, $mul472 = 0.0, $mul482 = 0.0, $mul529 = 0.0, $mul536 = 0.0, $mul549 = 0.0, $mul553 = 0.0, $mul589 = 0.0, $narrow = 0, $not$cmp578 = 0, $or = 0;
 var $or$cond = 0, $or$cond2 = 0, $or$cond258 = 0, $or$cond259 = 0, $or$cond260 = 0, $or$cond261 = 0, $or$cond262 = 0, $or$cond262$not = 0, $or$cond263 = 0, $or$cond265 = 0, $or$cond4 = 0, $or$cond6 = 0, $or359 = 0, $or450 = 0, $or99 = 0, $rem = 0, $rem262 = 0, $retval$1 = 0.0, $rp$0$lcssa379 = 0, $rp$0328 = 0;
 var $rp$2$ph286 = 0, $rp$4$ph = 0, $rp$4$ph285 = 0, $rp$5321 = 0, $rpos = 0, $shend = 0, $shl412 = 0, $shr = 0, $shr230 = 0, $shr416 = 0, $shr419 = 0, $sub1 = 0, $sub170 = 0, $sub218 = 0, $sub225 = 0, $sub238 = 0, $sub255 = 0, $sub276 = 0, $sub276$rp$0 = 0, $sub286 = 0;
 var $sub300 = 0, $sub301 = 0, $sub322 = 0, $sub342 = 0, $sub348 = 0, $sub353 = 0, $sub356 = 0, $sub37 = 0, $sub37338 = 0, $sub37349 = 0, $sub413 = 0, $sub430 = 0, $sub430$rp$5 = 0, $sub447 = 0, $sub469 = 0, $sub484 = 0, $sub499 = 0, $sub502 = 0, $sub505 = 0.0, $sub559 = 0;
 var $sub570 = 0.0, $sub573 = 0, $sub60 = 0, $sub63$sink = 0, $sum = 0, $tobool107 = 0, $tobool110 = 0, $tobool125 = 0, $tobool138 = 0, $tobool180 = 0, $tobool244 = 0, $tobool273 = 0, $tobool281 = 0, $tobool331 = 0, $tobool345 = 0, $tobool425 = 0, $tobool436 = 0, $tobool520 = 0, $tobool56 = 0, $tobool564 = 0;
 var $tobool598 = 0, $tobool95 = 0, $tobool98 = 0, $tobool98267 = 0, $tobool98272 = 0, $tobool98273275 = 0, $x = 0, $y$0317 = 0.0, $y$1 = 0.0, $y$2 = 0.0, $y$3 = 0.0, $z$0 = 0, $z$1 = 0, $z$1$ph287 = 0, $z$10 = 0, $z$2 = 0, $z$3 = 0, $z$4 = 0, $z$6$ph = 0, $z$9316 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 512|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(512|0);
 $x = sp;
 $sum = (($emin) + ($bits))|0;
 $sub1 = (0 - ($sum))|0;
 $rpos = ((($f)) + 4|0);
 $shend = ((($f)) + 100|0);
 $c$addr$0 = $c;$gotdig$0 = 0;
 L1: while(1) {
  switch ($c$addr$0|0) {
  case 46:  {
   label = 6;
   break L1;
   break;
  }
  case 48:  {
   break;
  }
  default: {
   $101 = 0;$102 = 0;$c$addr$2 = $c$addr$0;$gotdig$2 = $gotdig$0;$gotrad$0 = 0;
   break L1;
  }
  }
  $0 = HEAP32[$rpos>>2]|0;
  $1 = HEAP32[$shend>>2]|0;
  $cmp2 = ($0>>>0)<($1>>>0);
  if ($cmp2) {
   $incdec$ptr = ((($0)) + 1|0);
   HEAP32[$rpos>>2] = $incdec$ptr;
   $2 = HEAP8[$0>>0]|0;
   $conv = $2&255;
   $c$addr$0 = $conv;$gotdig$0 = 1;
   continue;
  } else {
   $call = (___shgetc($f)|0);
   $c$addr$0 = $call;$gotdig$0 = 1;
   continue;
  }
 }
 if ((label|0) == 6) {
  $3 = HEAP32[$rpos>>2]|0;
  $4 = HEAP32[$shend>>2]|0;
  $cmp8 = ($3>>>0)<($4>>>0);
  if ($cmp8) {
   $incdec$ptr12 = ((($3)) + 1|0);
   HEAP32[$rpos>>2] = $incdec$ptr12;
   $5 = HEAP8[$3>>0]|0;
   $conv13 = $5&255;
   $c$addr$1$ph = $conv13;
  } else {
   $call15 = (___shgetc($f)|0);
   $c$addr$1$ph = $call15;
  }
  $cmp19359 = ($c$addr$1$ph|0)==(48);
  if ($cmp19359) {
   $6 = 0;$7 = 0;
   while(1) {
    $8 = (_i64Add(($6|0),($7|0),-1,-1)|0);
    $9 = tempRet0;
    $10 = HEAP32[$rpos>>2]|0;
    $11 = HEAP32[$shend>>2]|0;
    $cmp25 = ($10>>>0)<($11>>>0);
    if ($cmp25) {
     $incdec$ptr29 = ((($10)) + 1|0);
     HEAP32[$rpos>>2] = $incdec$ptr29;
     $12 = HEAP8[$10>>0]|0;
     $conv30 = $12&255;
     $c$addr$1$be = $conv30;
    } else {
     $call32 = (___shgetc($f)|0);
     $c$addr$1$be = $call32;
    }
    $cmp19 = ($c$addr$1$be|0)==(48);
    if ($cmp19) {
     $6 = $8;$7 = $9;
    } else {
     $101 = $8;$102 = $9;$c$addr$2 = $c$addr$1$be;$gotdig$2 = 1;$gotrad$0 = 1;
     break;
    }
   }
  } else {
   $101 = 0;$102 = 0;$c$addr$2 = $c$addr$1$ph;$gotdig$2 = $gotdig$0;$gotrad$0 = 1;
  }
 }
 HEAP32[$x>>2] = 0;
 $sub37338 = (($c$addr$2) + -48)|0;
 $cmp38339 = ($sub37338>>>0)<(10);
 $cmp40340 = ($c$addr$2|0)==(46);
 $13 = $cmp40340 | $cmp38339;
 L20: do {
  if ($13) {
   $arrayidx77 = ((($x)) + 496|0);
   $103 = $101;$104 = $102;$14 = 0;$15 = 0;$c$addr$3348 = $c$addr$2;$cmp40350 = $cmp40340;$gotdig$3344 = $gotdig$2;$gotrad$1345 = $gotrad$0;$j$0347 = 0;$k$0346 = 0;$lnz$0343 = 0;$sub37349 = $sub37338;
   L22: while(1) {
    do {
     if ($cmp40350) {
      $cond = ($gotrad$1345|0)==(0);
      if ($cond) {
       $105 = $14;$106 = $15;$107 = $14;$108 = $15;$gotdig$4 = $gotdig$3344;$gotrad$2 = 1;$j$2 = $j$0347;$k$2 = $k$0346;$lnz$2 = $lnz$0343;
      } else {
       break L22;
      }
     } else {
      $cmp48 = ($k$0346|0)<(125);
      $16 = (_i64Add(($14|0),($15|0),1,0)|0);
      $17 = tempRet0;
      $cmp51 = ($c$addr$3348|0)!=(48);
      if (!($cmp48)) {
       if (!($cmp51)) {
        $105 = $103;$106 = $104;$107 = $16;$108 = $17;$gotdig$4 = $gotdig$3344;$gotrad$2 = $gotrad$1345;$j$2 = $j$0347;$k$2 = $k$0346;$lnz$2 = $lnz$0343;
        break;
       }
       $19 = HEAP32[$arrayidx77>>2]|0;
       $or = $19 | 1;
       HEAP32[$arrayidx77>>2] = $or;
       $105 = $103;$106 = $104;$107 = $16;$108 = $17;$gotdig$4 = $gotdig$3344;$gotrad$2 = $gotrad$1345;$j$2 = $j$0347;$k$2 = $k$0346;$lnz$2 = $lnz$0343;
       break;
      }
      $conv54$lnz$0 = $cmp51 ? $16 : $lnz$0343;
      $tobool56 = ($j$0347|0)==(0);
      $$pre = (($x) + ($k$0346<<2)|0);
      if ($tobool56) {
       $sub63$sink = $sub37349;
      } else {
       $18 = HEAP32[$$pre>>2]|0;
       $mul = ($18*10)|0;
       $add59 = (($c$addr$3348) + -48)|0;
       $sub60 = (($add59) + ($mul))|0;
       $sub63$sink = $sub60;
      }
      HEAP32[$$pre>>2] = $sub63$sink;
      $inc66 = (($j$0347) + 1)|0;
      $cmp67 = ($inc66|0)==(9);
      $inc70 = $cmp67&1;
      $inc70$k$0 = (($inc70) + ($k$0346))|0;
      $$inc66 = $cmp67 ? 0 : $inc66;
      $105 = $103;$106 = $104;$107 = $16;$108 = $17;$gotdig$4 = 1;$gotrad$2 = $gotrad$1345;$j$2 = $$inc66;$k$2 = $inc70$k$0;$lnz$2 = $conv54$lnz$0;
     }
    } while(0);
    $20 = HEAP32[$rpos>>2]|0;
    $21 = HEAP32[$shend>>2]|0;
    $cmp84 = ($20>>>0)<($21>>>0);
    if ($cmp84) {
     $incdec$ptr88 = ((($20)) + 1|0);
     HEAP32[$rpos>>2] = $incdec$ptr88;
     $22 = HEAP8[$20>>0]|0;
     $conv89 = $22&255;
     $c$addr$3$be = $conv89;
    } else {
     $call91 = (___shgetc($f)|0);
     $c$addr$3$be = $call91;
    }
    $sub37 = (($c$addr$3$be) + -48)|0;
    $cmp38 = ($sub37>>>0)<(10);
    $cmp40 = ($c$addr$3$be|0)==(46);
    $23 = $cmp40 | $cmp38;
    if ($23) {
     $103 = $105;$104 = $106;$14 = $107;$15 = $108;$c$addr$3348 = $c$addr$3$be;$cmp40350 = $cmp40;$gotdig$3344 = $gotdig$4;$gotrad$1345 = $gotrad$2;$j$0347 = $j$2;$k$0346 = $k$2;$lnz$0343 = $lnz$2;$sub37349 = $sub37;
    } else {
     $24 = $105;$25 = $107;$27 = $106;$28 = $108;$c$addr$3$lcssa = $c$addr$3$be;$gotdig$3$lcssa = $gotdig$4;$gotrad$1$lcssa = $gotrad$2;$j$0$lcssa = $j$2;$k$0$lcssa = $k$2;$lnz$0$lcssa = $lnz$2;
     label = 29;
     break L20;
    }
   }
   $tobool98267 = ($gotdig$3344|0)!=(0);
   $109 = $14;$110 = $15;$111 = $103;$112 = $104;$j$0298 = $j$0347;$k$0302 = $k$0346;$lnz$0308 = $lnz$0343;$tobool98273275 = $tobool98267;
   label = 37;
  } else {
   $24 = $101;$25 = 0;$27 = $102;$28 = 0;$c$addr$3$lcssa = $c$addr$2;$gotdig$3$lcssa = $gotdig$2;$gotrad$1$lcssa = $gotrad$0;$j$0$lcssa = 0;$k$0$lcssa = 0;$lnz$0$lcssa = 0;
   label = 29;
  }
 } while(0);
 do {
  if ((label|0) == 29) {
   $tobool95 = ($gotrad$1$lcssa|0)==(0);
   $26 = $tobool95 ? $25 : $24;
   $29 = $tobool95 ? $28 : $27;
   $tobool98 = ($gotdig$3$lcssa|0)!=(0);
   $or99 = $c$addr$3$lcssa | 32;
   $cmp100 = ($or99|0)==(101);
   $or$cond258 = $tobool98 & $cmp100;
   if (!($or$cond258)) {
    $cmp121 = ($c$addr$3$lcssa|0)>(-1);
    if ($cmp121) {
     $109 = $25;$110 = $28;$111 = $26;$112 = $29;$j$0298 = $j$0$lcssa;$k$0302 = $k$0$lcssa;$lnz$0308 = $lnz$0$lcssa;$tobool98273275 = $tobool98;
     label = 37;
     break;
    } else {
     $113 = $25;$114 = $28;$115 = $26;$116 = $29;$j$0297 = $j$0$lcssa;$k$0301 = $k$0$lcssa;$lnz$0307 = $lnz$0$lcssa;$tobool98272 = $tobool98;
     label = 39;
     break;
    }
   }
   $30 = (_scanexp($f,$pok)|0);
   $31 = tempRet0;
   $32 = ($30|0)==(0);
   $33 = ($31|0)==(-2147483648);
   $34 = $32 & $33;
   if ($34) {
    $tobool107 = ($pok|0)==(0);
    if ($tobool107) {
     ___shlim($f,0);
     $retval$1 = 0.0;
     break;
    }
    $35 = HEAP32[$shend>>2]|0;
    $tobool110 = ($35|0)==(0|0);
    if ($tobool110) {
     $37 = 0;$38 = 0;
    } else {
     $36 = HEAP32[$rpos>>2]|0;
     $incdec$ptr113 = ((($36)) + -1|0);
     HEAP32[$rpos>>2] = $incdec$ptr113;
     $37 = 0;$38 = 0;
    }
   } else {
    $37 = $30;$38 = $31;
   }
   $39 = (_i64Add(($37|0),($38|0),($26|0),($29|0))|0);
   $40 = tempRet0;
   $44 = $39;$46 = $25;$47 = $40;$49 = $28;$j$0296 = $j$0$lcssa;$k$0300 = $k$0$lcssa;$lnz$0306 = $lnz$0$lcssa;
   label = 41;
  }
 } while(0);
 if ((label|0) == 37) {
  $41 = HEAP32[$shend>>2]|0;
  $tobool125 = ($41|0)==(0|0);
  if ($tobool125) {
   $113 = $109;$114 = $110;$115 = $111;$116 = $112;$j$0297 = $j$0298;$k$0301 = $k$0302;$lnz$0307 = $lnz$0308;$tobool98272 = $tobool98273275;
   label = 39;
  } else {
   $42 = HEAP32[$rpos>>2]|0;
   $incdec$ptr128 = ((($42)) + -1|0);
   HEAP32[$rpos>>2] = $incdec$ptr128;
   if ($tobool98273275) {
    $44 = $111;$46 = $109;$47 = $112;$49 = $110;$j$0296 = $j$0298;$k$0300 = $k$0302;$lnz$0306 = $lnz$0308;
    label = 41;
   } else {
    label = 40;
   }
  }
 }
 if ((label|0) == 39) {
  if ($tobool98272) {
   $44 = $115;$46 = $113;$47 = $116;$49 = $114;$j$0296 = $j$0297;$k$0300 = $k$0301;$lnz$0306 = $lnz$0307;
   label = 41;
  } else {
   label = 40;
  }
 }
 do {
  if ((label|0) == 40) {
   $call135 = (___errno_location()|0);
   HEAP32[$call135>>2] = 22;
   ___shlim($f,0);
   $retval$1 = 0.0;
  }
  else if ((label|0) == 41) {
   $43 = HEAP32[$x>>2]|0;
   $tobool138 = ($43|0)==(0);
   if ($tobool138) {
    $conv140 = (+($sign|0));
    $mul141 = $conv140 * 0.0;
    $retval$1 = $mul141;
    break;
   }
   $45 = ($44|0)==($46|0);
   $48 = ($47|0)==($49|0);
   $50 = $45 & $48;
   $51 = ($49|0)<(0);
   $52 = ($46>>>0)<(10);
   $53 = ($49|0)==(0);
   $54 = $53 & $52;
   $55 = $51 | $54;
   $or$cond = $55 & $50;
   if ($or$cond) {
    $cmp149 = ($bits|0)>(30);
    $shr = $43 >>> $bits;
    $cmp152 = ($shr|0)==(0);
    $or$cond259 = $cmp149 | $cmp152;
    if ($or$cond259) {
     $conv155 = (+($sign|0));
     $conv157 = (+($43>>>0));
     $mul158 = $conv155 * $conv157;
     $retval$1 = $mul158;
     break;
    }
   }
   $div = (($emin|0) / -2)&-1;
   $56 = ($div|0)<(0);
   $57 = $56 << 31 >> 31;
   $58 = ($47|0)>($57|0);
   $59 = ($44>>>0)>($div>>>0);
   $60 = ($47|0)==($57|0);
   $61 = $60 & $59;
   $62 = $58 | $61;
   if ($62) {
    $call165 = (___errno_location()|0);
    HEAP32[$call165>>2] = 34;
    $conv166 = (+($sign|0));
    $mul167 = $conv166 * 1.7976931348623157E+308;
    $mul168 = $mul167 * 1.7976931348623157E+308;
    $retval$1 = $mul168;
    break;
   }
   $sub170 = (($emin) + -106)|0;
   $63 = ($sub170|0)<(0);
   $64 = $63 << 31 >> 31;
   $65 = ($47|0)<($64|0);
   $66 = ($44>>>0)<($sub170>>>0);
   $67 = ($47|0)==($64|0);
   $68 = $67 & $66;
   $69 = $65 | $68;
   if ($69) {
    $call175 = (___errno_location()|0);
    HEAP32[$call175>>2] = 34;
    $conv176 = (+($sign|0));
    $mul177 = $conv176 * 2.2250738585072014E-308;
    $mul178 = $mul177 * 2.2250738585072014E-308;
    $retval$1 = $mul178;
    break;
   }
   $tobool180 = ($j$0296|0)==(0);
   if ($tobool180) {
    $k$3 = $k$0300;
   } else {
    $cmp183335 = ($j$0296|0)<(9);
    if ($cmp183335) {
     $arrayidx186 = (($x) + ($k$0300<<2)|0);
     $arrayidx186$promoted = HEAP32[$arrayidx186>>2]|0;
     $j$3336 = $j$0296;$mul187337 = $arrayidx186$promoted;
     while(1) {
      $mul187 = ($mul187337*10)|0;
      $inc189 = (($j$3336) + 1)|0;
      $exitcond377 = ($inc189|0)==(9);
      if ($exitcond377) {
       break;
      } else {
       $j$3336 = $inc189;$mul187337 = $mul187;
      }
     }
     HEAP32[$arrayidx186>>2] = $mul187;
    }
    $inc191 = (($k$0300) + 1)|0;
    $k$3 = $inc191;
   }
   $cmp194 = ($lnz$0306|0)<(9);
   if ($cmp194) {
    $cmp197 = ($lnz$0306|0)<=($44|0);
    $cmp200 = ($44|0)<(18);
    $or$cond2 = $cmp197 & $cmp200;
    if ($or$cond2) {
     $cmp203 = ($44|0)==(9);
     $70 = HEAP32[$x>>2]|0;
     if ($cmp203) {
      $conv206 = (+($sign|0));
      $conv208 = (+($70>>>0));
      $mul209 = $conv206 * $conv208;
      $retval$1 = $mul209;
      break;
     }
     $cmp211 = ($44|0)<(9);
     if ($cmp211) {
      $conv214 = (+($sign|0));
      $conv216 = (+($70>>>0));
      $mul217 = $conv214 * $conv216;
      $sub218 = (8 - ($44))|0;
      $arrayidx219 = (844 + ($sub218<<2)|0);
      $71 = HEAP32[$arrayidx219>>2]|0;
      $conv220 = (+($71|0));
      $div221 = $mul217 / $conv220;
      $retval$1 = $div221;
      break;
     }
     $$neg = Math_imul($44, -3)|0;
     $mul224$neg = (($bits) + 27)|0;
     $sub225 = (($mul224$neg) + ($$neg))|0;
     $cmp226 = ($sub225|0)>(30);
     $shr230 = $70 >>> $sub225;
     $cmp231 = ($shr230|0)==(0);
     $or$cond260 = $cmp226 | $cmp231;
     if ($or$cond260) {
      $sub238 = (($44) + -10)|0;
      $arrayidx239 = (844 + ($sub238<<2)|0);
      $conv234 = (+($sign|0));
      $conv236 = (+($70>>>0));
      $mul237 = $conv234 * $conv236;
      $72 = HEAP32[$arrayidx239>>2]|0;
      $conv240 = (+($72|0));
      $mul241 = $mul237 * $conv240;
      $retval$1 = $mul241;
      break;
     }
    }
   }
   $rem = (($44|0) % 9)&-1;
   $tobool244 = ($rem|0)==(0);
   if ($tobool244) {
    $a$2$ph288 = 0;$e2$0$ph = 0;$rp$2$ph286 = $44;$z$1$ph287 = $k$3;
   } else {
    $cmp246 = ($44|0)>(-1);
    $add252 = (($rem) + 9)|0;
    $cond254 = $cmp246 ? $rem : $add252;
    $sub255 = (8 - ($cond254))|0;
    $arrayidx256 = (844 + ($sub255<<2)|0);
    $73 = HEAP32[$arrayidx256>>2]|0;
    $cmp258327 = ($k$3|0)==(0);
    if ($cmp258327) {
     $a$0$lcssa380 = 0;$rp$0$lcssa379 = $44;$z$0 = 0;
    } else {
     $div267 = (1000000000 / ($73|0))&-1;
     $a$0329 = 0;$carry$0331 = 0;$k$4330 = 0;$rp$0328 = $44;
     while(1) {
      $arrayidx261 = (($x) + ($k$4330<<2)|0);
      $74 = HEAP32[$arrayidx261>>2]|0;
      $rem262 = (($74>>>0) % ($73>>>0))&-1;
      $div264 = (($74>>>0) / ($73>>>0))&-1;
      $add265 = (($div264) + ($carry$0331))|0;
      HEAP32[$arrayidx261>>2] = $add265;
      $mul268 = Math_imul($div267, $rem262)|0;
      $cmp269 = ($k$4330|0)==($a$0329|0);
      $tobool273 = ($add265|0)==(0);
      $or$cond261 = $cmp269 & $tobool273;
      $add275 = (($a$0329) + 1)|0;
      $and = $add275 & 127;
      $sub276 = (($rp$0328) + -9)|0;
      $sub276$rp$0 = $or$cond261 ? $sub276 : $rp$0328;
      $and$a$0 = $or$cond261 ? $and : $a$0329;
      $inc279 = (($k$4330) + 1)|0;
      $cmp258 = ($inc279|0)==($k$3|0);
      if ($cmp258) {
       break;
      } else {
       $a$0329 = $and$a$0;$carry$0331 = $mul268;$k$4330 = $inc279;$rp$0328 = $sub276$rp$0;
      }
     }
     $tobool281 = ($mul268|0)==(0);
     if ($tobool281) {
      $a$0$lcssa380 = $and$a$0;$rp$0$lcssa379 = $sub276$rp$0;$z$0 = $k$3;
     } else {
      $arrayidx284 = (($x) + ($k$3<<2)|0);
      $inc283 = (($k$3) + 1)|0;
      HEAP32[$arrayidx284>>2] = $mul268;
      $a$0$lcssa380 = $and$a$0;$rp$0$lcssa379 = $sub276$rp$0;$z$0 = $inc283;
     }
    }
    $sub286 = (9 - ($cond254))|0;
    $add287 = (($sub286) + ($rp$0$lcssa379))|0;
    $a$2$ph288 = $a$0$lcssa380;$e2$0$ph = 0;$rp$2$ph286 = $add287;$z$1$ph287 = $z$0;
   }
   L101: while(1) {
    $cmp289 = ($rp$2$ph286|0)<(18);
    $cmp292 = ($rp$2$ph286|0)==(18);
    $arrayidx294 = (($x) + ($a$2$ph288<<2)|0);
    $e2$0 = $e2$0$ph;$z$1 = $z$1$ph287;
    while(1) {
     if (!($cmp289)) {
      if (!($cmp292)) {
       $a$4$ph = $a$2$ph288;$e2$1$ph = $e2$0;$rp$4$ph285 = $rp$2$ph286;$z$6$ph = $z$1;
       break L101;
      }
      $75 = HEAP32[$arrayidx294>>2]|0;
      $cmp295 = ($75>>>0)<(9007199);
      if (!($cmp295)) {
       $a$4$ph = $a$2$ph288;$e2$1$ph = $e2$0;$rp$4$ph285 = 18;$z$6$ph = $z$1;
       break L101;
      }
     }
     $sub301 = (($z$1) + 127)|0;
     $carry299$0 = 0;$k$5$in = $sub301;$z$2 = $z$1;
     while(1) {
      $k$5 = $k$5$in & 127;
      $arrayidx306 = (($x) + ($k$5<<2)|0);
      $76 = HEAP32[$arrayidx306>>2]|0;
      $77 = (_bitshift64Shl(($76|0),0,29)|0);
      $78 = tempRet0;
      $79 = (_i64Add(($77|0),($78|0),($carry299$0|0),0)|0);
      $80 = tempRet0;
      $81 = ($80>>>0)>(0);
      $82 = ($79>>>0)>(1000000000);
      $83 = ($80|0)==(0);
      $84 = $83 & $82;
      $85 = $81 | $84;
      if ($85) {
       $86 = (___udivdi3(($79|0),($80|0),1000000000,0)|0);
       $87 = tempRet0;
       $88 = (___uremdi3(($79|0),($80|0),1000000000,0)|0);
       $89 = tempRet0;
       $add309$sink$off0 = $88;$carry299$1 = $86;
      } else {
       $add309$sink$off0 = $79;$carry299$1 = 0;
      }
      HEAP32[$arrayidx306>>2] = $add309$sink$off0;
      $sub322 = (($z$2) + 127)|0;
      $and323 = $sub322 & 127;
      $cmp324 = ($k$5|0)!=($and323|0);
      $cmp327 = ($k$5|0)==($a$2$ph288|0);
      $or$cond262 = $cmp324 | $cmp327;
      $or$cond262$not = $or$cond262 ^ 1;
      $tobool331 = ($add309$sink$off0|0)==(0);
      $or$cond263 = $tobool331 & $or$cond262$not;
      $z$3 = $or$cond263 ? $k$5 : $z$2;
      $sub342 = (($k$5) + -1)|0;
      if ($cmp327) {
       break;
      } else {
       $carry299$0 = $carry299$1;$k$5$in = $sub342;$z$2 = $z$3;
      }
     }
     $sub300 = (($e2$0) + -29)|0;
     $tobool345 = ($carry299$1|0)==(0);
     if ($tobool345) {
      $e2$0 = $sub300;$z$1 = $z$3;
     } else {
      break;
     }
    }
    $add347 = (($rp$2$ph286) + 9)|0;
    $sub348 = (($a$2$ph288) + 127)|0;
    $and349 = $sub348 & 127;
    $cmp350 = ($and349|0)==($z$3|0);
    $sub353 = (($z$3) + 127)|0;
    $and354 = $sub353 & 127;
    $sub356 = (($z$3) + 126)|0;
    $and357 = $sub356 & 127;
    $arrayidx358 = (($x) + ($and357<<2)|0);
    if ($cmp350) {
     $arrayidx355 = (($x) + ($and354<<2)|0);
     $90 = HEAP32[$arrayidx355>>2]|0;
     $91 = HEAP32[$arrayidx358>>2]|0;
     $or359 = $91 | $90;
     HEAP32[$arrayidx358>>2] = $or359;
     $z$4 = $and354;
    } else {
     $z$4 = $z$3;
    }
    $arrayidx361 = (($x) + ($and349<<2)|0);
    HEAP32[$arrayidx361>>2] = $carry299$1;
    $a$2$ph288 = $and349;$e2$0$ph = $sub300;$rp$2$ph286 = $add347;$z$1$ph287 = $z$4;
   }
   L119: while(1) {
    $add438 = (($z$6$ph) + 1)|0;
    $and439 = $add438 & 127;
    $sub447 = (($z$6$ph) + 127)|0;
    $and448 = $sub447 & 127;
    $arrayidx449 = (($x) + ($and448<<2)|0);
    $a$4$ph386 = $a$4$ph;$e2$1$ph385 = $e2$1$ph;$rp$4$ph = $rp$4$ph285;
    while(1) {
     $cmp396 = ($rp$4$ph|0)==(18);
     $cmp400 = ($rp$4$ph|0)>(27);
     $$264 = $cmp400 ? 9 : 1;
     $a$4 = $a$4$ph386;$e2$1 = $e2$1$ph385;
     while(1) {
      $i$0319 = 0;
      while(1) {
       $add371 = (($i$0319) + ($a$4))|0;
       $and372 = $add371 & 127;
       $cmp373 = ($and372|0)==($z$6$ph|0);
       if ($cmp373) {
        $i$1 = 2;
        label = 88;
        break;
       }
       $arrayidx376 = (($x) + ($and372<<2)|0);
       $92 = HEAP32[$arrayidx376>>2]|0;
       $arrayidx377 = (876 + ($i$0319<<2)|0);
       $93 = HEAP32[$arrayidx377>>2]|0;
       $cmp378 = ($92>>>0)<($93>>>0);
       if ($cmp378) {
        $i$1 = 2;
        label = 88;
        break;
       }
       $cmp386 = ($92>>>0)>($93>>>0);
       if ($cmp386) {
        break;
       }
       $inc391 = (($i$0319) + 1)|0;
       $cmp368 = ($inc391|0)<(2);
       if ($cmp368) {
        $i$0319 = $inc391;
       } else {
        $i$1 = $inc391;
        label = 88;
        break;
       }
      }
      if ((label|0) == 88) {
       label = 0;
       $cmp393 = ($i$1|0)==(2);
       $or$cond4 = $cmp396 & $cmp393;
       if ($or$cond4) {
        $i$4318 = 0;$y$0317 = 0.0;$z$9316 = $z$6$ph;
        break L119;
       }
      }
      $add404 = (($$264) + ($e2$1))|0;
      $cmp406320 = ($a$4|0)==($z$6$ph|0);
      if ($cmp406320) {
       $a$4 = $z$6$ph;$e2$1 = $add404;
      } else {
       break;
      }
     }
     $shl412 = 1 << $$264;
     $sub413 = (($shl412) + -1)|0;
     $shr419 = 1000000000 >>> $$264;
     $a$5322 = $a$4;$carry365$0324 = 0;$k$6323 = $a$4;$rp$5321 = $rp$4$ph;
     while(1) {
      $arrayidx411 = (($x) + ($k$6323<<2)|0);
      $94 = HEAP32[$arrayidx411>>2]|0;
      $and414 = $94 & $sub413;
      $shr416 = $94 >>> $$264;
      $add417 = (($shr416) + ($carry365$0324))|0;
      HEAP32[$arrayidx411>>2] = $add417;
      $mul420 = Math_imul($and414, $shr419)|0;
      $cmp421 = ($k$6323|0)==($a$5322|0);
      $tobool425 = ($add417|0)==(0);
      $or$cond265 = $cmp421 & $tobool425;
      $add427 = (($a$5322) + 1)|0;
      $and428 = $add427 & 127;
      $sub430 = (($rp$5321) + -9)|0;
      $sub430$rp$5 = $or$cond265 ? $sub430 : $rp$5321;
      $and428$a$5 = $or$cond265 ? $and428 : $a$5322;
      $add433 = (($k$6323) + 1)|0;
      $and434 = $add433 & 127;
      $cmp406 = ($and434|0)==($z$6$ph|0);
      if ($cmp406) {
       break;
      } else {
       $a$5322 = $and428$a$5;$carry365$0324 = $mul420;$k$6323 = $and434;$rp$5321 = $sub430$rp$5;
      }
     }
     $tobool436 = ($mul420|0)==(0);
     if ($tobool436) {
      $a$4$ph386 = $and428$a$5;$e2$1$ph385 = $add404;$rp$4$ph = $sub430$rp$5;
      continue;
     }
     $cmp440 = ($and439|0)==($and428$a$5|0);
     if (!($cmp440)) {
      break;
     }
     $95 = HEAP32[$arrayidx449>>2]|0;
     $or450 = $95 | 1;
     HEAP32[$arrayidx449>>2] = $or450;
     $a$4$ph386 = $and428$a$5;$e2$1$ph385 = $add404;$rp$4$ph = $sub430$rp$5;
    }
    $arrayidx443 = (($x) + ($z$6$ph<<2)|0);
    HEAP32[$arrayidx443>>2] = $mul420;
    $a$4$ph = $and428$a$5;$e2$1$ph = $add404;$rp$4$ph285 = $sub430$rp$5;$z$6$ph = $and439;
   }
   while(1) {
    $add462 = (($i$4318) + ($a$4))|0;
    $and463 = $add462 & 127;
    $cmp464 = ($and463|0)==($z$9316|0);
    $add467 = (($z$9316) + 1)|0;
    $and468 = $add467 & 127;
    if ($cmp464) {
     $sub469 = (($and468) + -1)|0;
     $arrayidx470 = (($x) + ($sub469<<2)|0);
     HEAP32[$arrayidx470>>2] = 0;
     $z$10 = $and468;
    } else {
     $z$10 = $z$9316;
    }
    $mul472 = $y$0317 * 1.0E+9;
    $arrayidx475 = (($x) + ($and463<<2)|0);
    $96 = HEAP32[$arrayidx475>>2]|0;
    $conv476 = (+($96>>>0));
    $add477 = $mul472 + $conv476;
    $inc479 = (($i$4318) + 1)|0;
    $exitcond = ($inc479|0)==(2);
    if ($exitcond) {
     break;
    } else {
     $i$4318 = $inc479;$y$0317 = $add477;$z$9316 = $z$10;
    }
   }
   $conv481 = (+($sign|0));
   $mul482 = $conv481 * $add477;
   $add483 = (($e2$1) + 53)|0;
   $sub484 = (($add483) - ($emin))|0;
   $cmp485 = ($sub484|0)<($bits|0);
   $97 = ($sub484|0)>(0);
   $$sub489 = $97 ? $sub484 : 0;
   $bits$addr$0 = $cmp485 ? $$sub489 : $bits;
   $cmp495 = ($bits$addr$0|0)<(53);
   if ($cmp495) {
    $sub499 = (105 - ($bits$addr$0))|0;
    $call500 = (+_scalbn(1.0,$sub499));
    $call501 = (+_copysignl($call500,$mul482));
    $sub502 = (53 - ($bits$addr$0))|0;
    $call503 = (+_scalbn(1.0,$sub502));
    $call504 = (+_fmodl($mul482,$call503));
    $sub505 = $mul482 - $call504;
    $add506 = $call501 + $sub505;
    $bias$0 = $call501;$frac$0 = $call504;$y$1 = $add506;
   } else {
    $bias$0 = 0.0;$frac$0 = 0.0;$y$1 = $mul482;
   }
   $add508 = (($a$4) + 2)|0;
   $and509 = $add508 & 127;
   $cmp510 = ($and509|0)==($z$10|0);
   if ($cmp510) {
    $frac$3 = $frac$0;
   } else {
    $arrayidx516 = (($x) + ($and509<<2)|0);
    $98 = HEAP32[$arrayidx516>>2]|0;
    $cmp517 = ($98>>>0)<(500000000);
    do {
     if ($cmp517) {
      $tobool520 = ($98|0)==(0);
      if ($tobool520) {
       $add523 = (($a$4) + 3)|0;
       $and524 = $add523 & 127;
       $cmp525 = ($and524|0)==($z$10|0);
       if ($cmp525) {
        $frac$1 = $frac$0;
        break;
       }
      }
      $mul529 = $conv481 * 0.25;
      $add530 = $mul529 + $frac$0;
      $frac$1 = $add530;
     } else {
      $cmp532 = ($98|0)==(500000000);
      if (!($cmp532)) {
       $mul536 = $conv481 * 0.75;
       $add537 = $mul536 + $frac$0;
       $frac$1 = $add537;
       break;
      }
      $add543 = (($a$4) + 3)|0;
      $and544 = $add543 & 127;
      $cmp545 = ($and544|0)==($z$10|0);
      if ($cmp545) {
       $mul549 = $conv481 * 0.5;
       $add550 = $mul549 + $frac$0;
       $frac$1 = $add550;
       break;
      } else {
       $mul553 = $conv481 * 0.75;
       $add554 = $mul553 + $frac$0;
       $frac$1 = $add554;
       break;
      }
     }
    } while(0);
    $sub559 = (53 - ($bits$addr$0))|0;
    $cmp560 = ($sub559|0)>(1);
    if ($cmp560) {
     $call563 = (+_fmodl($frac$1,1.0));
     $tobool564 = $call563 != 0.0;
     if ($tobool564) {
      $frac$3 = $frac$1;
     } else {
      $inc566 = $frac$1 + 1.0;
      $frac$3 = $inc566;
     }
    } else {
     $frac$3 = $frac$1;
    }
   }
   $add569 = $y$1 + $frac$3;
   $sub570 = $add569 - $bias$0;
   $and572 = $add483 & 2147483647;
   $sub573 = (-2 - ($sum))|0;
   $cmp574 = ($and572|0)>($sub573|0);
   do {
    if ($cmp574) {
     $call577 = (+Math_abs((+$sub570)));
     $cmp578 = !($call577 >= 9007199254740992.0);
     $mul589 = $sub570 * 0.5;
     $not$cmp578 = $cmp578 ^ 1;
     $inc590 = $not$cmp578&1;
     $e2$3 = (($inc590) + ($e2$1))|0;
     $y$2 = $cmp578 ? $sub570 : $mul589;
     $99 = (($e2$3) + 50)|0;
     $cmp593 = ($99|0)>($sub1|0);
     if (!($cmp593)) {
      $100 = ($bits$addr$0|0)!=($sub484|0);
      $narrow = $100 | $cmp578;
      $denormal$2$v = $cmp485 & $narrow;
      $tobool598 = $frac$3 != 0.0;
      $or$cond6 = $tobool598 & $denormal$2$v;
      if (!($or$cond6)) {
       $e2$4 = $e2$3;$y$3 = $y$2;
       break;
      }
     }
     $call600 = (___errno_location()|0);
     HEAP32[$call600>>2] = 34;
     $e2$4 = $e2$3;$y$3 = $y$2;
    } else {
     $e2$4 = $e2$1;$y$3 = $sub570;
    }
   } while(0);
   $call603 = (+_scalbnl($y$3,$e2$4));
   $retval$1 = $call603;
  }
 } while(0);
 STACKTOP = sp;return (+$retval$1);
}
function _scanexp($f,$pok) {
 $f = $f|0;
 $pok = $pok|0;
 var $$lcssa = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $add = 0, $c$0 = 0, $c$1$be = 0, $c$147 = 0, $c$2$be = 0, $c$2$lcssa = 0, $c$241 = 0, $c$3$be = 0, $call = 0;
 var $call104 = 0, $call17 = 0, $call58 = 0, $call85 = 0, $cmp = 0, $cmp10 = 0, $cmp20 = 0, $cmp32 = 0, $cmp4 = 0, $cmp44 = 0, $cmp46 = 0, $cmp51 = 0, $cmp64 = 0, $cmp6440 = 0, $cmp78 = 0, $cmp91 = 0, $cmp9138 = 0, $cmp97 = 0, $cond = 0, $cond19 = 0;
 var $conv = 0, $conv102 = 0, $conv15 = 0, $conv56 = 0, $conv7 = 0, $conv83 = 0, $incdec$ptr = 0, $incdec$ptr101 = 0, $incdec$ptr112 = 0, $incdec$ptr14 = 0, $incdec$ptr27 = 0, $incdec$ptr39 = 0, $incdec$ptr55 = 0, $incdec$ptr82 = 0, $mul = 0, $neg$0 = 0, $or$cond1 = 0, $rpos = 0, $shend = 0, $sub = 0;
 var $sub31 = 0, $sub43 = 0, $sub48 = 0, $sub63 = 0, $sub6339 = 0, $sub90 = 0, $sub9037 = 0, $tobool = 0, $tobool109 = 0, $tobool115 = 0, $tobool24 = 0, $tobool36 = 0, $x$048 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $rpos = ((($f)) + 4|0);
 $0 = HEAP32[$rpos>>2]|0;
 $shend = ((($f)) + 100|0);
 $1 = HEAP32[$shend>>2]|0;
 $cmp = ($0>>>0)<($1>>>0);
 if ($cmp) {
  $incdec$ptr = ((($0)) + 1|0);
  HEAP32[$rpos>>2] = $incdec$ptr;
  $2 = HEAP8[$0>>0]|0;
  $conv = $2&255;
  $cond = $conv;
 } else {
  $call = (___shgetc($f)|0);
  $cond = $call;
 }
 switch ($cond|0) {
 case 43: case 45:  {
  $cmp4 = ($cond|0)==(45);
  $conv7 = $cmp4&1;
  $3 = HEAP32[$rpos>>2]|0;
  $4 = HEAP32[$shend>>2]|0;
  $cmp10 = ($3>>>0)<($4>>>0);
  if ($cmp10) {
   $incdec$ptr14 = ((($3)) + 1|0);
   HEAP32[$rpos>>2] = $incdec$ptr14;
   $5 = HEAP8[$3>>0]|0;
   $conv15 = $5&255;
   $cond19 = $conv15;
  } else {
   $call17 = (___shgetc($f)|0);
   $cond19 = $call17;
  }
  $sub = (($cond19) + -48)|0;
  $cmp20 = ($sub>>>0)>(9);
  $tobool = ($pok|0)!=(0);
  $or$cond1 = $tobool & $cmp20;
  if ($or$cond1) {
   $6 = HEAP32[$shend>>2]|0;
   $tobool24 = ($6|0)==(0|0);
   if ($tobool24) {
    $c$0 = $cond19;$neg$0 = $conv7;
   } else {
    $7 = HEAP32[$rpos>>2]|0;
    $incdec$ptr27 = ((($7)) + -1|0);
    HEAP32[$rpos>>2] = $incdec$ptr27;
    $c$0 = $cond19;$neg$0 = $conv7;
   }
  } else {
   $c$0 = $cond19;$neg$0 = $conv7;
  }
  break;
 }
 default: {
  $c$0 = $cond;$neg$0 = 0;
 }
 }
 $sub31 = (($c$0) + -48)|0;
 $cmp32 = ($sub31>>>0)>(9);
 if ($cmp32) {
  $8 = HEAP32[$shend>>2]|0;
  $tobool36 = ($8|0)==(0|0);
  if ($tobool36) {
   $46 = -2147483648;$47 = 0;
  } else {
   $9 = HEAP32[$rpos>>2]|0;
   $incdec$ptr39 = ((($9)) + -1|0);
   HEAP32[$rpos>>2] = $incdec$ptr39;
   $46 = -2147483648;$47 = 0;
  }
 } else {
  $c$147 = $c$0;$x$048 = 0;
  while(1) {
   $mul = ($x$048*10)|0;
   $add = (($c$147) + -48)|0;
   $sub48 = (($add) + ($mul))|0;
   $10 = HEAP32[$rpos>>2]|0;
   $11 = HEAP32[$shend>>2]|0;
   $cmp51 = ($10>>>0)<($11>>>0);
   if ($cmp51) {
    $incdec$ptr55 = ((($10)) + 1|0);
    HEAP32[$rpos>>2] = $incdec$ptr55;
    $12 = HEAP8[$10>>0]|0;
    $conv56 = $12&255;
    $c$1$be = $conv56;
   } else {
    $call58 = (___shgetc($f)|0);
    $c$1$be = $call58;
   }
   $sub43 = (($c$1$be) + -48)|0;
   $cmp44 = ($sub43>>>0)<(10);
   $cmp46 = ($sub48|0)<(214748364);
   $13 = $cmp44 & $cmp46;
   if ($13) {
    $c$147 = $c$1$be;$x$048 = $sub48;
   } else {
    break;
   }
  }
  $14 = ($sub48|0)<(0);
  $15 = $14 << 31 >> 31;
  $sub6339 = (($c$1$be) + -48)|0;
  $cmp6440 = ($sub6339>>>0)<(10);
  if ($cmp6440) {
   $17 = $sub48;$18 = $15;$c$241 = $c$1$be;
   while(1) {
    $19 = (___muldi3(($17|0),($18|0),10,0)|0);
    $20 = tempRet0;
    $21 = ($c$241|0)<(0);
    $22 = $21 << 31 >> 31;
    $23 = (_i64Add(($c$241|0),($22|0),-48,-1)|0);
    $24 = tempRet0;
    $25 = (_i64Add(($23|0),($24|0),($19|0),($20|0))|0);
    $26 = tempRet0;
    $27 = HEAP32[$rpos>>2]|0;
    $28 = HEAP32[$shend>>2]|0;
    $cmp78 = ($27>>>0)<($28>>>0);
    if ($cmp78) {
     $incdec$ptr82 = ((($27)) + 1|0);
     HEAP32[$rpos>>2] = $incdec$ptr82;
     $29 = HEAP8[$27>>0]|0;
     $conv83 = $29&255;
     $c$2$be = $conv83;
    } else {
     $call85 = (___shgetc($f)|0);
     $c$2$be = $call85;
    }
    $sub63 = (($c$2$be) + -48)|0;
    $cmp64 = ($sub63>>>0)<(10);
    $30 = ($26|0)<(21474836);
    $31 = ($25>>>0)<(2061584302);
    $32 = ($26|0)==(21474836);
    $33 = $32 & $31;
    $34 = $30 | $33;
    $35 = $cmp64 & $34;
    if ($35) {
     $17 = $25;$18 = $26;$c$241 = $c$2$be;
    } else {
     $40 = $25;$41 = $26;$c$2$lcssa = $c$2$be;
     break;
    }
   }
  } else {
   $40 = $sub48;$41 = $15;$c$2$lcssa = $c$1$be;
  }
  $sub9037 = (($c$2$lcssa) + -48)|0;
  $cmp9138 = ($sub9037>>>0)<(10);
  $16 = HEAP32[$shend>>2]|0;
  if ($cmp9138) {
   $37 = $16;
   while(1) {
    $36 = HEAP32[$rpos>>2]|0;
    $cmp97 = ($36>>>0)<($37>>>0);
    if ($cmp97) {
     $incdec$ptr101 = ((($36)) + 1|0);
     HEAP32[$rpos>>2] = $incdec$ptr101;
     $38 = HEAP8[$36>>0]|0;
     $conv102 = $38&255;
     $48 = $37;$c$3$be = $conv102;
    } else {
     $call104 = (___shgetc($f)|0);
     $$pre = HEAP32[$shend>>2]|0;
     $48 = $$pre;$c$3$be = $call104;
    }
    $sub90 = (($c$3$be) + -48)|0;
    $cmp91 = ($sub90>>>0)<(10);
    if ($cmp91) {
     $37 = $48;
    } else {
     $$lcssa = $48;
     break;
    }
   }
  } else {
   $$lcssa = $16;
  }
  $tobool109 = ($$lcssa|0)==(0|0);
  if (!($tobool109)) {
   $39 = HEAP32[$rpos>>2]|0;
   $incdec$ptr112 = ((($39)) + -1|0);
   HEAP32[$rpos>>2] = $incdec$ptr112;
  }
  $tobool115 = ($neg$0|0)!=(0);
  $42 = (_i64Subtract(0,0,($40|0),($41|0))|0);
  $43 = tempRet0;
  $44 = $tobool115 ? $42 : $40;
  $45 = $tobool115 ? $43 : $41;
  $46 = $45;$47 = $44;
 }
 tempRet0 = ($46);
 return ($47|0);
}
function _scalbn($x,$n) {
 $x = +$x;
 $n = $n|0;
 var $$add14 = 0, $$add14$add = 0, $$sub4 = 0, $$sub4$sub = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0.0, $add = 0, $add14 = 0, $add21 = 0, $cmp = 0, $cmp1 = 0, $cmp11 = 0, $cmp8 = 0, $mul = 0.0, $mul10 = 0.0, $mul13 = 0.0, $mul13$mul10 = 0.0;
 var $mul22 = 0.0, $mul3 = 0.0, $mul3$mul = 0.0, $n$addr$0 = 0, $sub = 0, $sub4 = 0, $y$0 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $cmp = ($n|0)>(1023);
 if ($cmp) {
  $mul = $x * 8.9884656743115795E+307;
  $sub = (($n) + -1023)|0;
  $cmp1 = ($sub|0)>(1023);
  $mul3 = $mul * 8.9884656743115795E+307;
  $sub4 = (($n) + -2046)|0;
  $0 = ($sub4|0)<(1023);
  $$sub4 = $0 ? $sub4 : 1023;
  $$sub4$sub = $cmp1 ? $$sub4 : $sub;
  $mul3$mul = $cmp1 ? $mul3 : $mul;
  $n$addr$0 = $$sub4$sub;$y$0 = $mul3$mul;
 } else {
  $cmp8 = ($n|0)<(-1022);
  if ($cmp8) {
   $mul10 = $x * 2.2250738585072014E-308;
   $add = (($n) + 1022)|0;
   $cmp11 = ($add|0)<(-1022);
   $mul13 = $mul10 * 2.2250738585072014E-308;
   $add14 = (($n) + 2044)|0;
   $1 = ($add14|0)>(-1022);
   $$add14 = $1 ? $add14 : -1022;
   $$add14$add = $cmp11 ? $$add14 : $add;
   $mul13$mul10 = $cmp11 ? $mul13 : $mul10;
   $n$addr$0 = $$add14$add;$y$0 = $mul13$mul10;
  } else {
   $n$addr$0 = $n;$y$0 = $x;
  }
 }
 $add21 = (($n$addr$0) + 1023)|0;
 $2 = (_bitshift64Shl(($add21|0),0,52)|0);
 $3 = tempRet0;
 HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $3;$4 = +HEAPF64[tempDoublePtr>>3];
 $mul22 = $y$0 * $4;
 return (+$mul22);
}
function _copysignl($x,$y) {
 $x = +$x;
 $y = +$y;
 var $call = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (+_copysign($x,$y));
 return (+$call);
}
function _fmodl($x,$y) {
 $x = +$x;
 $y = +$y;
 var $call = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (+_fmod($x,$y));
 return (+$call);
}
function _scalbnl($x,$n) {
 $x = +$x;
 $n = $n|0;
 var $call = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $call = (+_scalbn($x,$n));
 return (+$call);
}
function _fmod($x,$y) {
 $x = +$x;
 $y = +$y;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0.0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $add = 0, $add128 = 0;
 var $add68 = 0, $cmp119 = 0, $cmp27 = 0, $cmp79 = 0, $cmp7966 = 0, $cmp85$lcssa = 0, $cmp8572 = 0, $conv = 0, $conv5 = 0, $dec = 0, $dec117 = 0, $dec64 = 0, $dec96 = 0, $div = 0.0, $ex$0$lcssa = 0, $ex$082 = 0, $ex$1 = 0, $ex$2$lcssa = 0, $ex$269 = 0, $ex$3$lcssa = 0;
 var $ex$363 = 0, $ey$0$lcssa = 0, $ey$078 = 0, $ey$1$ph = 0, $mul = 0.0, $mul107 = 0.0, $mul42 = 0.0, $mul42$x = 0.0, $mul91 = 0.0, $or$cond = 0, $retval$0 = 0.0, $tobool = 0, $tobool54 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $x;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 HEAPF64[tempDoublePtr>>3] = $y;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($0|0),($1|0),52)|0);
 $5 = tempRet0;
 $conv = $4 & 2047;
 $6 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $7 = tempRet0;
 $conv5 = $6 & 2047;
 $8 = $1 & -2147483648;
 $9 = (_bitshift64Shl(($2|0),($3|0),1)|0);
 $10 = tempRet0;
 $11 = ($9|0)==(0);
 $12 = ($10|0)==(0);
 $13 = $11 & $12;
 L1: do {
  if ($13) {
   label = 3;
  } else {
   $14 = (___DOUBLE_BITS_429($y)|0);
   $15 = tempRet0;
   $16 = $15 & 2147483647;
   $17 = ($16>>>0)>(2146435072);
   $18 = ($14>>>0)>(0);
   $19 = ($16|0)==(2146435072);
   $20 = $19 & $18;
   $21 = $17 | $20;
   $cmp27 = ($conv|0)==(2047);
   $or$cond = $cmp27 | $21;
   if ($or$cond) {
    label = 3;
   } else {
    $22 = (_bitshift64Shl(($0|0),($1|0),1)|0);
    $23 = tempRet0;
    $24 = ($23>>>0)>($10>>>0);
    $25 = ($22>>>0)>($9>>>0);
    $26 = ($23|0)==($10|0);
    $27 = $26 & $25;
    $28 = $24 | $27;
    if (!($28)) {
     $29 = ($22|0)==($9|0);
     $30 = ($23|0)==($10|0);
     $31 = $29 & $30;
     $mul42 = $x * 0.0;
     $mul42$x = $31 ? $mul42 : $x;
     return (+$mul42$x);
    }
    $tobool = ($conv|0)==(0);
    if ($tobool) {
     $32 = (_bitshift64Shl(($0|0),($1|0),12)|0);
     $33 = tempRet0;
     $34 = ($33|0)>(-1);
     $35 = ($32>>>0)>(4294967295);
     $36 = ($33|0)==(-1);
     $37 = $36 & $35;
     $38 = $34 | $37;
     if ($38) {
      $39 = $32;$40 = $33;$ex$082 = 0;
      while(1) {
       $dec = (($ex$082) + -1)|0;
       $41 = (_bitshift64Shl(($39|0),($40|0),1)|0);
       $42 = tempRet0;
       $43 = ($42|0)>(-1);
       $44 = ($41>>>0)>(4294967295);
       $45 = ($42|0)==(-1);
       $46 = $45 & $44;
       $47 = $43 | $46;
       if ($47) {
        $39 = $41;$40 = $42;$ex$082 = $dec;
       } else {
        $ex$0$lcssa = $dec;
        break;
       }
      }
     } else {
      $ex$0$lcssa = 0;
     }
     $add = (1 - ($ex$0$lcssa))|0;
     $48 = (_bitshift64Shl(($0|0),($1|0),($add|0))|0);
     $49 = tempRet0;
     $72 = $48;$73 = $49;$ex$1 = $ex$0$lcssa;
    } else {
     $50 = $1 & 1048575;
     $51 = $50 | 1048576;
     $72 = $0;$73 = $51;$ex$1 = $conv;
    }
    $tobool54 = ($conv5|0)==(0);
    if ($tobool54) {
     $52 = (_bitshift64Shl(($2|0),($3|0),12)|0);
     $53 = tempRet0;
     $54 = ($53|0)>(-1);
     $55 = ($52>>>0)>(4294967295);
     $56 = ($53|0)==(-1);
     $57 = $56 & $55;
     $58 = $54 | $57;
     if ($58) {
      $59 = $52;$60 = $53;$ey$078 = 0;
      while(1) {
       $dec64 = (($ey$078) + -1)|0;
       $61 = (_bitshift64Shl(($59|0),($60|0),1)|0);
       $62 = tempRet0;
       $63 = ($62|0)>(-1);
       $64 = ($61>>>0)>(4294967295);
       $65 = ($62|0)==(-1);
       $66 = $65 & $64;
       $67 = $63 | $66;
       if ($67) {
        $59 = $61;$60 = $62;$ey$078 = $dec64;
       } else {
        $ey$0$lcssa = $dec64;
        break;
       }
      }
     } else {
      $ey$0$lcssa = 0;
     }
     $add68 = (1 - ($ey$0$lcssa))|0;
     $68 = (_bitshift64Shl(($2|0),($3|0),($add68|0))|0);
     $69 = tempRet0;
     $74 = $68;$75 = $69;$ey$1$ph = $ey$0$lcssa;
    } else {
     $70 = $3 & 1048575;
     $71 = $70 | 1048576;
     $74 = $2;$75 = $71;$ey$1$ph = $conv5;
    }
    $cmp7966 = ($ex$1|0)>($ey$1$ph|0);
    $76 = (_i64Subtract(($72|0),($73|0),($74|0),($75|0))|0);
    $77 = tempRet0;
    $78 = ($77|0)>(-1);
    $79 = ($76>>>0)>(4294967295);
    $80 = ($77|0)==(-1);
    $81 = $80 & $79;
    $82 = $78 | $81;
    L23: do {
     if ($cmp7966) {
      $134 = $72;$135 = $73;$83 = $76;$85 = $77;$cmp8572 = $82;$ex$269 = $ex$1;
      while(1) {
       if ($cmp8572) {
        $84 = ($83|0)==(0);
        $86 = ($85|0)==(0);
        $87 = $84 & $86;
        if ($87) {
         break;
        } else {
         $88 = $83;$89 = $85;
        }
       } else {
        $88 = $134;$89 = $135;
       }
       $90 = (_bitshift64Shl(($88|0),($89|0),1)|0);
       $91 = tempRet0;
       $dec96 = (($ex$269) + -1)|0;
       $cmp79 = ($dec96|0)>($ey$1$ph|0);
       $92 = (_i64Subtract(($90|0),($91|0),($74|0),($75|0))|0);
       $93 = tempRet0;
       $94 = ($93|0)>(-1);
       $95 = ($92>>>0)>(4294967295);
       $96 = ($93|0)==(-1);
       $97 = $96 & $95;
       $98 = $94 | $97;
       if ($cmp79) {
        $134 = $90;$135 = $91;$83 = $92;$85 = $93;$cmp8572 = $98;$ex$269 = $dec96;
       } else {
        $101 = $93;$136 = $90;$137 = $91;$99 = $92;$cmp85$lcssa = $98;$ex$2$lcssa = $dec96;
        break L23;
       }
      }
      $mul91 = $x * 0.0;
      $retval$0 = $mul91;
      break L1;
     } else {
      $101 = $77;$136 = $72;$137 = $73;$99 = $76;$cmp85$lcssa = $82;$ex$2$lcssa = $ex$1;
     }
    } while(0);
    if ($cmp85$lcssa) {
     $100 = ($99|0)==(0);
     $102 = ($101|0)==(0);
     $103 = $100 & $102;
     if ($103) {
      $mul107 = $x * 0.0;
      $retval$0 = $mul107;
      break;
     } else {
      $104 = $101;$106 = $99;
     }
    } else {
     $104 = $137;$106 = $136;
    }
    $105 = ($104>>>0)<(1048576);
    $107 = ($106>>>0)<(0);
    $108 = ($104|0)==(1048576);
    $109 = $108 & $107;
    $110 = $105 | $109;
    if ($110) {
     $111 = $106;$112 = $104;$ex$363 = $ex$2$lcssa;
     while(1) {
      $113 = (_bitshift64Shl(($111|0),($112|0),1)|0);
      $114 = tempRet0;
      $dec117 = (($ex$363) + -1)|0;
      $115 = ($114>>>0)<(1048576);
      $116 = ($113>>>0)<(0);
      $117 = ($114|0)==(1048576);
      $118 = $117 & $116;
      $119 = $115 | $118;
      if ($119) {
       $111 = $113;$112 = $114;$ex$363 = $dec117;
      } else {
       $120 = $113;$121 = $114;$ex$3$lcssa = $dec117;
       break;
      }
     }
    } else {
     $120 = $106;$121 = $104;$ex$3$lcssa = $ex$2$lcssa;
    }
    $cmp119 = ($ex$3$lcssa|0)>(0);
    if ($cmp119) {
     $122 = (_i64Add(($120|0),($121|0),0,-1048576)|0);
     $123 = tempRet0;
     $124 = (_bitshift64Shl(($ex$3$lcssa|0),0,52)|0);
     $125 = tempRet0;
     $126 = $122 | $124;
     $127 = $123 | $125;
     $131 = $127;$133 = $126;
    } else {
     $add128 = (1 - ($ex$3$lcssa))|0;
     $128 = (_bitshift64Lshr(($120|0),($121|0),($add128|0))|0);
     $129 = tempRet0;
     $131 = $129;$133 = $128;
    }
    $130 = $131 | $8;
    HEAP32[tempDoublePtr>>2] = $133;HEAP32[tempDoublePtr+4>>2] = $130;$132 = +HEAPF64[tempDoublePtr>>3];
    $retval$0 = $132;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $mul = $x * $y;
  $div = $mul / $mul;
  $retval$0 = $div;
 }
 return (+$retval$0);
}
function ___DOUBLE_BITS_429($__f) {
 $__f = +$__f;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $__f;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($1);
 return ($0|0);
}
function _copysign($x,$y) {
 $x = +$x;
 $y = +$y;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $x;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 HEAPF64[tempDoublePtr>>3] = $y;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = $1 & 2147483647;
 $5 = $3 & -2147483648;
 $6 = $5 | $4;
 HEAP32[tempDoublePtr>>2] = $0;HEAP32[tempDoublePtr+4>>2] = $6;$7 = +HEAPF64[tempDoublePtr>>3];
 return (+$7);
}
function _vscanf($fmt,$ap) {
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $0 = 0, $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[2]|0;
 $call = (_vfscanf($0,$fmt,$ap)|0);
 return ($call|0);
}
function _scanf($fmt,$varargs) {
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $ap = 0, $call = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 $call = (_vscanf($fmt,$ap)|0);
 STACKTOP = sp;return ($call|0);
}
function runPostSets() {
}
function ___muldsi3($a, $b) {
    $a = $a | 0;
    $b = $b | 0;
    var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
    $1 = $a & 65535;
    $2 = $b & 65535;
    $3 = Math_imul($2, $1) | 0;
    $6 = $a >>> 16;
    $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
    $11 = $b >>> 16;
    $12 = Math_imul($11, $1) | 0;
    return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
    $x_sroa_0_0_extract_trunc = $a$0;
    $y_sroa_0_0_extract_trunc = $b$0;
    $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
    $1$1 = tempRet0;
    $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
    return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        ___setErrNo(12);
        return -1;
      }
    }
    return oldDynamicTop|0;
}

  
function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&1](a1|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&7](a1|0,a2|0,a3|0)|0;
}

function b0(p0) {
 p0 = p0|0; nullFunc_ii(0);return 0;
}
function b1(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(1);return 0;
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_ii = [b0,___stdio_close];
var FUNCTION_TABLE_iiii = [b1,b1,___stdio_read,___stdio_seek,___stdio_write,___stdout_write,b1,b1];

  return { ___errno_location: ___errno_location, ___muldi3: ___muldi3, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _fflush: _fflush, _free: _free, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _llvm_bswap_i32: _llvm_bswap_i32, _main: _main, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____muldi3 = asm["___muldi3"]; asm["___muldi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____muldi3.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__main.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___muldi3 = Module["___muldi3"] = asm["___muldi3"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _main = Module["_main"] = asm["_main"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["ccall"]) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["cwrap"]) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayFromBase64"]) Module["intArrayFromBase64"] = function() { abort("'intArrayFromBase64' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["tryParseAsDataURI"]) Module["tryParseAsDataURI"] = function() { abort("'tryParseAsDataURI' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
    if (memoryInitializerBytes) {
      applyMemoryInitializer(memoryInitializerBytes.buffer);
    } else
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
          var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
          if (data) {
            response = data.buffer;
          } else {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
          }
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(Module['thisProgram']);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
      exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      var toLog = e;
      if (e && typeof e === 'object' && e.stack) {
        toLog = [e, e.stack];
      }
      Module.printErr('exception thrown: ' + toLog);
      Module['quit'](1, e);
    }
  } finally {
    calledMain = true;
  }
}




/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;


function exit(status, implicit) {

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but noExitRuntime is set due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



