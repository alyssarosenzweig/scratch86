scratch86
===========

scratc86 is a super fast compiler for MIT Scratch projects--- it's meaningless to so much as _try_ to compare to the standard Scratch interpreter. scratch86 compiles projects directly to LLVM IR, and the Scratch standard library is handwritten in C. Compiling your project with scratch86 puts an entirely new meaning to Turbo Mode. Check it out!

Installing
============

Simply clone the repository for the source code. scratch86 depends on LLVM, clang, SDL2, SDL2-image, POSIX support (Windows support is on the feature list, but for now only Macs and Linux machines are supported), node.js, and GNU Make. Once everything is installed, simply `cd` into the cloned directory and type `make` to build the sample "Animate the Crab" project. It will load automatically if all is well, and while running `make` may take a while, after that you can replay the project any time by running `a.out`. 

Is feature XYZ supported?
============

Probably not. scratch86 is under active development, and at the moment, if you're not a low-level programmer, this probably won't be very interesting to you... yet! Hang tight!

Who are you?
==============

I'm Alyssa Rosenzweig, better known as @bobbybee on Scratch. I make fun stuff with code, and no matter how much low-level programming I do, I always seem to come back to Scratch, one way or another. Scratch on!
