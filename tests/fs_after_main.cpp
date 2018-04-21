#include <stdio.h>
#include <assert.h>
#include <emscripten.h>

// test file operations after main() exits

#define NAME "file.cpp"

EMSCRIPTEN_KEEPALIVE
extern "C" void finish(void*) {
  EM_ASM({
    var printed = Module['extraSecretBuffer'].split('Iteration').length - 1;
    console.log(printed);
    assert(printed == 5, 'should have printed 5 iterations');
  });
  printf("Test passed.\n");
#ifdef REPORT_RESULT
  REPORT_RESULT(0);
#endif
}

EMSCRIPTEN_KEEPALIVE
extern "C" void looper() {
  // exiting main should not cause any weirdness with file opening
  printf("Iteration\n");
  FILE* f = fopen("/dev/stdin", "rb");
  if (!f) {
    printf("Test failed.\n");
#ifdef REPORT_RESULT
    REPORT_RESULT(1);
#endif
  }
  fclose(f);
}

int main() {
  EM_ASM({
    (function() {
      // exiting main should not cause any weirdness with printing
      var realPrint = Module['print'];
      var realPrintChars = Module['printChars'];
      Module['extraSecretBuffer'] = '';
      Module['print'] = function(x) {
        Module['extraSecretBuffer'] += x;
        realPrint(x);
      };
      Module['printChars'] = function(str_or_offset, fd, len, buffer) {
        var str = UTF8ArrayToString((typeof str_or_offset === 'number') ? buffer : str_or_offset, str_or_offset, len);
        Module['extraSecretBuffer'] += str;
        realPrintChars(str_or_offset, fd, len, buffer);
      }
    })();
  });
  printf("Start\n");
  FILE* f = fopen(NAME, "wb");
  fclose(f);
  printf("Looping...\n");
  EM_ASM({
#if UNBUFFERED_PRINT == 0
    Module['print']('js');
#else
    Module['printChars']('js');
#endif
    var counter = 0;
    function looper() {
#if UNBUFFERED_PRINT == 0
      Module['print']('js looping');
#else
    Module['printChars']('js looping');
#endif
      Module['_looper']();
      counter++;
      if (counter < 5) {
#if UNBUFFERED_PRINT == 0
        Module['print']('js queueing');
#else
    Module['printChars']('js queueing');
#endif
        setTimeout(looper, 1);
      } else {
#if UNBUFFERED_PRINT == 0
        Module['print']('js finishing');
#else
    Module['printChars']('js finishing');
#endif
        setTimeout(Module['_finish'], 1);
      }
    }
    looper();
  });
}
