> ## Documentation Index
> Fetch the complete documentation index at: https://docs.fireworks.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Embeddings & Reranking

> Generate embeddings and rerank results for semantic search

Fireworks hosts embedding and reranking models, which are useful for tasks like RAG and semantic search.

## Generating embeddings

Embeddings models take text as input and output a vector of floating point numbers to use for tasks like similarity comparisons and search. Our embedding service is OpenAI compatible. Refer to OpenAI's embeddings [guide](https://platform.openai.com/docs/guides/embeddings)  and OpenAI's [embeddings documentation](https://platform.openai.com/docs/api-reference/embeddings) for more information on using these models.


To generate variable-length embeddings, you can add the `dimensions` parameter to the request, for example, `dimensions: 128`.

The API usage for embedding models is identical for BERT-based and LLM-based embeddings. Simply use the `/v1/embeddings` endpoint with your chosen model.

## Model Availability

Fireworks hosts several purpose-built embeddings models, which are optimized specifically for tasks like semantic search and document similarity comparison. We host the SOTA Qwen3 Embeddings family of models:

* `fireworks/qwen3-embedding-8b` (\*available on serverless)
* `fireworks/qwen3-embedding-4b`
* `fireworks/qwen3-embedding-0p6b`

<AccordionGroup>
  <Accordion title="Use any LLM as an embeddings model">
    You can retrieve embeddings from any LLM in our model library. Here are some examples of LLMs that work with the embeddings API:

    * `fireworks/glm-4p5`
    * `fireworks/gpt-oss-20b`
    * `fireworks/kimi-k2-instruct-0905`
    * `fireworks/deepseek-r1-0528`
  </Accordion>

  <Accordion title="Bring your own model">
    You can also retrieve embeddings from any models you bring yourself through [custom model upload](/models/uploading-custom-models).
  </Accordion>

  <Accordion title="BERT-based models (legacy)">
    These BERT-based models are available on serverless only:

    * `nomic-ai/nomic-embed-text-v1.5`
    * `nomic-ai/nomic-embed-text-v1`
    * `WhereIsAI/UAE-Large-V1`
    * `thenlper/gte-large`
    * `thenlper/gte-base`
    * `BAAI/bge-base-en-v1.5`
    * `BAAI/bge-small-en-v1.5`
    * `mixedbread-ai/mxbai-embed-large-v1`
    * `sentence-transformers/all-MiniLM-L6-v2`
    * `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
  </Accordion>
</AccordionGroup>

## Reranking documents

Reranking models are used to rerank a list of documents based on a query. We support reranking with the Qwen3 Reranker family of models:

* `fireworks/qwen3-reranker-8b` (\*available on serverless)
* `fireworks/qwen3-reranker-4b`
* `fireworks/qwen3-reranker-0p6b`

### Using the `/rerank` endpoint

The `/rerank` endpoint provides a simple interface for reranking documents.

<Note>
  The `/rerank` endpoint does not yet support all models and parallelism options. For more flexibility, use the `/embeddings` endpoint with `return_logits` as shown in the next section.
</Note>


### Using the `/embeddings` endpoint

You can also use the `/embeddings` endpoint with the `return_logits` parameter to rerank documents. This approach supports more models and parallelism options.

The embedding model takes in token IDs for "yes" and "no" and outputs associated logits indicating how likely the document is relevant or not relevant to the query. You can obtain these token IDs using `tokenizer.convert_tokens_to_ids()` with the transformers library and the Qwen3 tokenizer.

<Tabs>
  <Tab title="Simple">

    # Format prompts as query-document pairs using the Qwen3 Reranker format
    instruction = "Given a web search query, retrieve relevant passages that answer the query"
    prompts = [
        f"<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {doc}"
        for doc in documents
    ]

    # Token IDs for "no" and "yes" in Qwen3 reranker models
    token_false_id = 2753   # "no"
    token_true_id = 9454    # "yes"

    payload = {
        "model": "fireworks/qwen3-reranker-8b",
        "input": prompts,
        "return_logits": [token_false_id, token_true_id],
        "normalize": True  # Applies softmax to the selected logits
    }

    headers = {
        "Authorization": "Bearer <FIREWORKS_API_KEY>",
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers).json()

    # Extract relevance scores (probability of "yes" token)
    results = []
    for i, item in enumerate(response["data"]):
        probs = item["embedding"]  # [no_prob, yes_prob]
        relevance_score = probs[1]  # "yes" probability is the relevance score
        results.append({
            "index": i,
            "relevance_score": relevance_score,
            "document": documents[i]
        })

    # Sort by relevance score (highest first)
    results.sort(key=lambda x: x["relevance_score"], reverse=True)

    for result in results:
        print(f"Score: {result['relevance_score']:.4f} - {result['document'][:80]}...")

    
  </Tab>

  <Tab title="Parallel (asyncio)">
    For large document sets, you can improve throughput by sending multiple requests in parallel using minibatches:

    
    # Format prompts as query-document pairs using the Qwen3 Reranker format
    instruction = "Given a web search query, retrieve relevant passages that answer the query"
    prompts = [
        f"<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {doc}"
        for doc in documents
    ]

    # Token IDs for "no" and "yes" in Qwen3 reranker models
    token_false_id = 2753   # "no"
    token_true_id = 9454    # "yes"

    headers = {
        "Authorization": "Bearer <FIREWORKS_API_KEY>",
        "Content-Type": "application/json"
    }

    async def rerank_batch(session, batch_prompts):
        payload = {
            "model": "fireworks/qwen3-reranker-8b",
            "input": batch_prompts,
            "return_logits": [token_false_id, token_true_id],
            "normalize": True
        }
        async with session.post(url, json=payload, headers=headers) as response:
            return await response.json()

    async def rerank_parallel(prompts, batch_size=100):
        batches = [prompts[i:i+batch_size] for i in range(0, len(prompts), batch_size)]

        async with aiohttp.ClientSession() as session:
            tasks = [rerank_batch(session, batch) for batch in batches]
            results = await asyncio.gather(*tasks)

        # Combine results from all batches
        all_scores = []
        for result in results:
            for item in result["data"]:
                all_scores.append(item["embedding"][1])  # "yes" probability

        return all_scores

    scores = asyncio.run(rerank_parallel(prompts))
  </Tab>
</Tabs>

With `normalize=True`, the endpoint applies softmax to the selected logits, returning probabilities that sum to 1. The "yes" probability directly represents the relevance score.

## Deploying embeddings and reranking models

While Qwen3 Embedding 8b and Qwen3 Reranker 8b are available on serverless, you also have the option to deploy them via [on-demand deployments](/guides/ondemand-deployments).
