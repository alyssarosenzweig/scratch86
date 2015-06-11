all:
	clang -emit-llvm -c src/stdlib.c -o src/stdlib.bc `sdl2-config --cflags`
