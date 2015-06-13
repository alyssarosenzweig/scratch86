all:
	clang -Wall -Werror -Wextra -O1 -emit-llvm -c src/stdlib.c -o src/stdlib.bc `sdl2-config --cflags`
