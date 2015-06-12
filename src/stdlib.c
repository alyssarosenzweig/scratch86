/*
 * stdlib.c - Scratch standard library, implemented in C
 * this is part of the scratch86 project,
 * and as such will not be useful for a generic Scratch interpreter:
 * sure, it implements general Scratch stuff, but it also implements a lot of very specific code that isn't really relevant..
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <SDL.h>

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
    CLONE = 129,
    VARIABLE_WATCHER = 256,
    LIST_WATCHER = 257,
};

typedef struct VisibleObject_s {
    bool isVisible;
    enum ObjectType type;

    double x;
    double y;
    double rotation;
    uint32_t costumeNumber;

    uint32_t class;

    struct VisibleObject_s* nextObject;
} VisibleObject;


// we use casts for this:
// yay polymorphism!

typedef struct {
    enum ObjectType type;
} VisibleClass;

typedef struct {
    enum ObjectType type;

    // two pointers:
    // one for a dynamically resizable array,
    // the other because of SDL itself

    SDL_Surface** costumes;
} VisibleClass_Sprite;

typedef struct {
    enum ObjectType type;
    SDL_Surface** backgrounds;
} VisibleClass_Stage;

// linked list
VisibleObject* objectList;

// also dynamically resizable
// the backend will generate definitions to populate this
VisibleClass** classList;

// global SDL context
SDL_Window* window;

typedef void (*Script)(void);

Script* greenFlagScripts;
int greenFlagScriptCount;
int gfscs = 0;

void greenFlagClicked();
void callScript(Script s);

void setEventCount(int eventType, int count) {
    if(eventType == 1) {
        greenFlagScriptCount = count;
        greenFlagScripts = malloc(sizeof(Script) * count);
    }
}

void registerEvent(int eventType, Script s) {
    if(eventType == 1) {
        // greenFlag

        greenFlagScripts[gfscs++] = s;
    }
}

void ScratchInitialize() {
    // intiialize SDL
    SDL_Init(SDL_INIT_VIDEO);

    // make a window
    window = 
        SDL_CreateWindow(
            "scratch86 Project", 
            SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED, 
            480, 360, 
            SDL_WINDOW_OPENGL
        );

    if(window == NULL) {
        printf("Bah! SDL error: %s\n", SDL_GetError());
        exit(1);
    }

    // metaphorical clicking of the green flag
    greenFlagClicked();

    // now, we hang this thread
    // all of the computation is in pthreads
    // TODO: event loop here?

    SDL_Event e;

    for(;;) {
        if(SDL_WaitEvent(&e)) {
            if(e.type == SDL_QUIT) {
                return;
            }
        }
    }
}

void ScratchDestroy() {
    SDL_DestroyWindow(window);
    SDL_Quit();
}

// we don't _actually_ have a green flag button,
// but this routine just loops through greenFlagScripts,
// and calls every function in its own thread

void greenFlagClicked() {
    if(greenFlagScripts == NULL) {
        printf("Uh oh! No green flag events have been allocated. That's not good...");
    }

    int i = 0;

    while(i < greenFlagScriptCount) {
        Script s = greenFlagScripts[i];
        
        // as much as I want to call it directly,
        // we have to implement Scratch's threading capabilities correctly
        // (ugh)
        // to the pthread's!
        // TODO: windows support

        callScript(s);

        ++i;
    }
}

// threading-based Script call
// TODO: windows macro shim

void callScript(Script s) {
    pthread_t thread;
    pthread_create(&thread, NULL, s, NULL);
}

// ScratchRenderStage does just what its name implies:
// it traverse the objectList and renders anything that's not hidden
// this is called as part of the SDL event loop

void ScratchRenderStage() {
    // iterate through the linked list
    // TODO: integrate with SDL

    VisibleObject* currentObject = objectList;
    
    while(currentObject != NULL) {
        printf("%d: (%f,%f)", currentObject->class, currentObject->x, currentObject->y);

        currentObject = currentObject->nextObject;
    }
}

// sdtoa - Scratch double to ASCII
// dtoa wrapper
// TODO: REMEMBER TO FREE MEMORY

char* sdtoa(double d) {
    char* output = malloc(16);
    snprintf(output, 15, "%lf", d);
    return output;
}
