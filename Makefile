all:
	clang -Wall -Werror -Wextra -O1 -emit-llvm -c src/stdlib.c -o src/stdlib.bc `sdl2-config --cflags`
	./bin/lionize.js 66919542 -o out.ll && clang out.ll src/stdlib.bc -O3 `sdl2-config --libs` -lSDL2_image -Wall -Werror -Wextra -lm && ./a.out	
