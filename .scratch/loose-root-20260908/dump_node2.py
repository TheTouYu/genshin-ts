import json, sys, subprocess
gil, graph_id, out, nidx = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
subprocess.run(["npx", "tsx", "tools/parse-gil-node-graph.ts", gil, "--graph", graph_id, "--json"],
               stdout=open(out, "w"), stderr=subprocess.DEVNULL, check=True)
d = json.load(open(out))
for n in d["graph"]["nodes"]:
    if n.get("index") == nidx:
        print("api:", n.get("api"), "generic:", n.get("generic_id"), "concrete:", n.get("concrete_id"))
        for i, p in enumerate(n.get("pins", [])):
            print("pin%d:" % i, json.dumps(p, ensure_ascii=False, sort_keys=True))