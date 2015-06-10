all:
	clang -emit-llvm -c src/stdlib.c -o src/stdlib.bc
