#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <fcntl.h>
#include <emscripten.h>

#ifdef NODERAWFS
#define CWD ""
#else
#define CWD "/working/"
#endif

int main(void)
{
    EM_ASM(
#ifdef NODERAWFS
        FS.close(FS.open('test.txt', 'w'));
#else
        FS.mkdir('/working');
        FS.mount(NODEFS, {root: '.'}, '/working');
        FS.close(FS.open('/working/test.txt', 'w'));
#endif
    );
    assert(open(CWD "test.txt", O_RDONLY | O_CLOEXEC) != -1);
    printf("success\n");
    return 0;
}
