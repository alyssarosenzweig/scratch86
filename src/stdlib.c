/*
 * stdlib.c - Scratch standard library, implemented in C
 * this is part of the scratch86 project,
 * and as such will not be useful for a generic Scratch interpreter:
 * sure, it implements general Scratch stuff, but it also implements a lot of very specific code that isn't really relevant..
 */

#include <stdio.h>
#include <stdlib.h>

// VisibleObject
// general structure for anything visible on screen
// this boils down to sprites, clones, and watchers
// this structure contains all the necessary information
// to draw the object on screen
//
// costumeNumber is a bit of a misnomer:
// it does indeed refer to the costumeNumber (indexed by 0) for sprites,
// but it is background number for the Stage,
// and the watcher type for variable watchers (normal, big, slider)
// list watchers can probably just be set to 0
//
// 'class' is actually what it sounds like:
// what _class_ this _object_ belongs to (it's an OOP thing, OK?)
// it is used as an index to the compile-time generated VisibleClass array
// basically, the class would tell the renderer where to look for the costume number,
// or where to get the data from for a watcher 
//
// finally, there is a pointer to another VisibleObject
// this is because all of the objects will be stored in a linked list,
// and the VisibleObject itself is the node :)

enum ObjectType {
    STAGE = 0,
    SPRITE = 128,
    CLONE = 129
    VARIABLE_WATCHER = 256,
    LIST_WATCHER = 257,
};

typedef struct {
    bool isVisible;
    enum ObjectType type;

    double x;
    double y;
    double rotation;
    uint32_t costumeNumber;

    uint32_t class;

    VisibleObject* nextObject;
} VisibleObject;

// sdtoa - Scratch double to ASCII
// dtoa wrapper
// TODO: REMEMBER TO FREE MEMORY

char* sdtoa(double d) {
    char* output = malloc(16);
    snprintf(output, 15, "%lf", d);
    return output;
}
