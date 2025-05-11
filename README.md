# relay-llm-docs

Simple repo that pulls the relay docs from their repo and compiles them into a single file in an llm-friendly format.

This allows easily pasting into LLM context.

It will compile every version of the docs and make them available separately.


## Running the script

```bash
./build.mts
```

Note: requires node >= v24 for running typescript natively with node.

If you need to compile older versions that have since been removed from the repo, you can pass a tag to the script. It will compile all the docs available at that repo snapshot.

```bash
./build.mts v18.0.0
```