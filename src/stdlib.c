/*
 * stdlib.c - Scratch standard library, implemented in C
 * this is part of the scratch86 project,
 * and as such will not be useful for a generic Scratch interpreter:
 * sure, it implements general Scratch stuff, but it also implements a lot of very specific code that isn't really relevant..
 */

#include <stdio.h>
#include <stdlib.h>

// sdtoa - Scratch double to ASCII
// dtoa wrapper
// TODO: REMEMBER TO FREE MEMORY

char* sdtoa(double d) {
    char* output = malloc(16);
    snprintf(output, 15, "%lf", d);
    return output;
}
