// SPDX-FileCopyrightText: 2025-2026 The Increvise Project Contributors
//
// SPDX-License-Identifier: GPL-3.0-or-later

const { env, pipeline } = await import('@xenova/transformers')

const MODEL = 'Xenova/multilingual-e5-small'
env.allowRemoteModels = true

const extractor = await pipeline('feature-extraction', MODEL, {
  quantized: true,
})

async function embedText(text) {
  const output = await extractor(text, {
    pooling: 'mean',
    normalize: true,
  })

  return Float32Array.from(output.data)
}

async function findContentByEmbeddingAndLineCount(parentContent, targetEmbedding, numberOfLines) {
  const lines = parentContent.split('\n')

  if (!targetEmbedding || numberOfLines <= 0 || lines.length < numberOfLines) {
    return null
  }

  let bestMatch = null

  for (let start = 0; start <= lines.length - numberOfLines; start++) {
    const content = lines.slice(start, start + numberOfLines).join('\n')
    const currentEmbedding = await embedText(content)

    if (!currentEmbedding || currentEmbedding.length !== targetEmbedding.length) {
      continue
    }

    function cosineSimilarity(vecA, vecB) {
      if (vecA.length !== vecB.length) {
        throw new Error('Vectors must be of the same length')
      }
      let dotProduct = 0
      let normA = 0
      let normB = 0
      for (let i = 0; i < vecA.length; i++) {
        const a = vecA[i]
        const b = vecB[i]
        dotProduct += a * b
        normA += a * a
        normB += b * b
      }
      const denominator = Math.sqrt(normA) * Math.sqrt(normB)
      return dotProduct / denominator
    }

    const similarity = cosineSimilarity(targetEmbedding, currentEmbedding)

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = {
        start: start + 1,
        end: start + numberOfLines,
        similarity,
      }
    }
  }

  if (!bestMatch || bestMatch.similarity < 0.82) {
    return null
  }

  return bestMatch
}

const orig_content = `malloc
If you define an array inside a function, it's only stored as a local variableson on the stack. Once the function returns, the array is deallocated. You can no longer have access to that memory adderss.

If you want to pass or return the array to another functions, you need to assign a memory location to to array using malloc. malloc register a patch of memory and returns the registerd memory address to your pointer. By passing your pointer to other functions, other functions can now have access to that memory address.

## Use it before strcpy
Before copying to a a new string, allocate the memory for the string first. strcpy doesn't alloctate the memory for you.

## malloc for string
When assigning a string array, don't use the square-bracket syntax (char string[]). Use the astrisk form char * string) to indicate that this is a character pointer.
`

const expanded_text = `Here is the expanded continuation of the rewritten content, maintaining the same technical tone and building on the explanation of dynamic memory allocation for arrays in C.

---

If you define an array inside a function, it is stored as a local variable on the stack. Once the function returns, the array is deallocated, and you can no longer access that memory address.

To pass or return the array to other functions, you need to allocate memory for it using malloc. malloc reserves a block of memory from the heap and returns the address of that registered memory region to your pointer. By passing this pointer to other functions, those functions can now access and modify the same memory location, even after the original function has returned.

This approach is essential because memory allocated with malloc persists until it is explicitly freed with free(). Unlike stack-allocated arrays, which are automatically destroyed when their enclosing function exits, heap-allocated arrays remain intact across function boundaries. This allows you to safely return a pointer to the array from a function, or share it among multiple functions without losing access.

For example, consider a function that creates an integer array of dynamic size. If you declare the array locally and try to return its name (which decays to a pointer), you would be returning the address of a stack-allocated variable that will be overwritten or reused after the function returns. This leads to undefined behavior, often manifesting as garbled data or program crashes. However, if you allocate the same array using malloc, the memory resides on the heap, and the pointer you return remains valid until you call free.

Therefore, when working with arrays that need to outlive the function in which they are created, dynamic memory allocation using malloc (or similar functions like calloc or realloc) is not just helpful—it is necessary. Just remember to deallocate the memory once it is no longer needed to avoid memory leaks.


Let me know if you would like a version with code examples or a more beginner-friendly rewrite.`

const expanded_vec = await embedText(expanded_text)

const shrinked_text =
  'An array inside a function is stack-allocated and lost after return. To pass or return it, use malloc for heap allocation, then share the pointer.'
const shrinked_vec = await embedText(shrinked_text)

const res = await findContentByEmbeddingAndLineCount(orig_content, expanded_vec, 3)
console.log(res)

const res2 = await findContentByEmbeddingAndLineCount(orig_content, shrinked_vec, 3)
console.log(res2)

const chi_text = `如果你在函数内部定义一个数组，它只会作为局部变量存储在栈上。
一旦函数返回，该数组就会被释放，你再也无法访问那个内存地址。

如果你想把数组传递给其他函数或从函数中返回它，就需要使用 malloc 为数组分配内存。
malloc 会注册一块内存，并将这块已注册内存的地址返回给你的指针。
通过将你的指针传递给其他函数，这些函数就可以访问那个内存地址了。
`
const extracted_chi_content = `
區域陣列在函數返回後就會失效。`
const chi_vec = await embedText(extracted_chi_content)

const res3 = await findContentByEmbeddingAndLineCount(chi_text, chi_vec, 3)
console.log(res3)

const translated_chi_content = `如果你在函數內部定義一個陣列，它只會作為區域變數儲存在堆疊（stack）上。一旦函數返回，該陣列就會被釋放，你將無法再存取那個記憶體位址。`
const translated_chi_vec = await embedText(translated_chi_content)

const res4 = await findContentByEmbeddingAndLineCount(orig_content, translated_chi_vec, 3)
console.log(res4)
