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

#include <pthread.h>

#include <SDL.h>
#include <SDL_image.h>

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

void setX(VisibleObject* obj, double x) { obj->x = x; }
void setY(VisibleObject* obj, double y) { obj->y = y; }

// we use casts for this:
// yay polymorphism!

typedef struct {
    enum ObjectType type;
    VisibleObject* mainObject;
} VisibleClass;

typedef struct {
    enum ObjectType type;
    VisibleObject* mainObject;
    
    // two pointers:
    // one for a dynamically resizable array,
    // the other because of SDL itself

    SDL_Surface** costumes;
    int costumeCount;
} VisibleClass_Sprite;

typedef struct {
    enum ObjectType type;
    VisibleObject* mainObject;

    SDL_Surface** backgrounds;
    int backgroundCount;
} VisibleClass_Stage;

// linked list
VisibleObject* objectList;

// also dynamically resizable
// the backend will generate definitions to populate this
VisibleClass** classList;
int classCount = 0;
int ccrs = 0;

// global SDL context
SDL_Window* window;
SDL_Surface* windowSurface;

int STAGE_WIDTH = 480,
    STAGE_HEIGHT = 360;

#define SCALE_SCRATCH_X(x) (( (x+240) / 480) * STAGE_WIDTH)
#define SCALE_SCRATCH_Y(y) (( (180-y) / 360) * STAGE_HEIGHT)

typedef void* (*Script)(void*);

Script* greenFlagScripts;
uint32_t *greenFlagClasses;
int greenFlagScriptCount;
int gfscs = 0;

void greenFlagClicked();
void callScript(Script s, VisibleObject* obj);

void setEventCount(int eventType, int count) {
    if(eventType == 1) {
        greenFlagScriptCount = count;
        greenFlagScripts = malloc(sizeof(Script) * count);
        greenFlagClasses = malloc(sizeof(uint32_t) * count);
    }
}

void registerEvent(int eventType, Script s, uint32_t classId) {
    if(eventType == 1) {
        // greenFlag

        greenFlagScripts[gfscs] = s;
        greenFlagClasses[gfscs++] = classId;
    }
}

// TODO: more properties of sprites

void setClassCount(int count) {
    classCount = count;
    classList = malloc(sizeof(VisibleClass*) * count);
}

void registerSpriteClass(const char* const costumes[], int costumeCount) {
    VisibleClass_Sprite* cls = malloc(sizeof(VisibleClass_Sprite*));
    cls->type = SPRITE;

    printf("Cls alloced\n");

    cls->costumeCount = costumeCount;
    cls->costumes = malloc(costumeCount * sizeof(SDL_Surface*));

    printf("Cost alloced\n");

    while(costumeCount--) {
        SDL_Surface *image = IMG_Load(costumes[costumeCount]);

        if(!image) {
            printf("Load error: %s\n", IMG_GetError());
            printf("Image: %s\n", costumes[costumeCount]);
            exit(0);
        }

        cls->costumes[costumeCount] = image;
    }

    classList[ccrs++] = (VisibleClass*) cls; 
}

void ScratchRenderStage();

void ScratchInitialize() {
    // intiialize SDL
    SDL_Init(SDL_INIT_VIDEO);

    // make a window
    window = 
        SDL_CreateWindow(
            "scratch86 Project", 
            SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED, 
            STAGE_WIDTH, STAGE_HEIGHT, 
            SDL_WINDOW_OPENGL
        );

    if(window == NULL) {
        printf("Bah! SDL error: %s\n", SDL_GetError());
        exit(1);
    }

    windowSurface = SDL_GetWindowSurface(window);

    // metaphorical clicking of the green flag
    greenFlagClicked();

    // now, we hang this thread
    // all of the computation is in pthreads
    // TODO: event loop here?

    SDL_Event e;

    for(;;) {
        while(SDL_PollEvent(&e)) {
            if(e.type == SDL_QUIT) {
                return;
            }
        }

        // render everything here

        ScratchRenderStage();
        SDL_Delay(20); // TODO: determine appropriate FPS for this
    }
}

void ScratchDestroy() {
    SDL_FreeSurface(windowSurface);
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

        callScript(s, classList[ greenFlagClasses[i] ]->mainObject);

        ++i;
    }
}

// threading-based Script call
// TODO: windows macro shim

void callScript(Script s, VisibleObject* obj) {
    pthread_t thread;
    pthread_create(&thread, NULL, s, obj);
}

// ScratchRenderStage does just what its name implies:
// it traverse the objectList and renders anything that's not hidden
// this is called as part of the SDL event loop

void ScratchRenderStage() {
    // iterate through the linked list
    // TODO: integrate with SDL

    VisibleObject* currentObject = objectList;
    
    while(currentObject != NULL) {
        SDL_Rect location;

        // TODO: scale X and Y to use Scratch's coordinate system instead of SDL's
        
        location.x = SCALE_SCRATCH_X(currentObject->x);
        location.y = SCALE_SCRATCH_Y(currentObject->y);

        SDL_BlitSurface( ((VisibleClass_Sprite*) classList[currentObject->class])->costumes[0],
                         NULL,
                         windowSurface,
                         &location );

        currentObject = currentObject->nextObject;
    }

    SDL_UpdateWindowSurface(window);
}

void newVisibleObject(bool isVisible, enum ObjectType type, double x, double y, double rotation, uint32_t costumeNumber, uint32_t class) {
    VisibleObject* obj = malloc(sizeof(VisibleObject));
    obj->isVisible = isVisible;
    obj->type = type;
    obj->x = x;
    obj->y = y;
    obj->rotation = rotation;
    obj->costumeNumber = costumeNumber;
    obj->class = class;

    obj->nextObject = NULL; 

    if(objectList) {
        objectList->nextObject = obj;
    } else {
        objectList = obj;
    }

    // record us as pioneers if that's what we are...
    // <3 excessive useless word choice
    
    if(!classList[class]->mainObject)
        classList[class]->mainObject = obj;
}

// sdtoa - Scratch double to ASCII
// dtoa wrapper
// TODO: REMEMBER TO FREE MEMORY

char* sdtoa(double d) {
    char* output = malloc(16);
    snprintf(output, 15, "%lf", d);
    return output;
}

// cross-platform usleep, sort of

void scratchsleep(double seconds) {
    // split seconds into integer and decimal part
    // then multiplication
    // TODO: more precise way
    // TODO: Windows
    
    struct timespec spec;
    spec.tv_sec = (int) seconds;
    spec.tv_nsec = ((seconds - (double) spec.tv_sec)) * (1000000000);

    nanosleep(&spec, NULL);
}
