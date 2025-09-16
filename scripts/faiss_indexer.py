# scripts/faiss_indexer.py
import faiss
import json
import sys
import numpy as np
import os

import sys
print("PYTHON PATH:", sys.executable, file=sys.stderr)
print("FAISS import: SUCCESS", file=sys.stderr)

try:
    import faiss
    print("FAISS import: SUCCESS", file=sys.stderr)
except Exception as e:
    print("FAISS import failed:", e, file=sys.stderr)



INDEX_FILE = "faiss_user.index"
ID_MAP_FILE = "faiss_id_map.json"
DIM = 1280  # MobileNetV2 output size

def load_index():
    if os.path.exists(INDEX_FILE):
        return faiss.read_index(INDEX_FILE)
    else:
        return faiss.IndexFlatL2(DIM)

def load_id_map():
    if os.path.exists(ID_MAP_FILE):
        with open(ID_MAP_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_id_map(id_map):
    with open(ID_MAP_FILE, 'w') as f:
        json.dump(id_map, f)

def save_index(index):
    faiss.write_index(index, INDEX_FILE)

def add_embedding(user_id, vector):
    index = load_index()
    id_map = load_id_map()

    reverse_map = {v: int(k) for k, v in id_map.items()}

    # If the user already exists, remove their old embedding
    if user_id in reverse_map:
        old_idx = reverse_map[user_id]
        # Remove old vector by rebuilding index (since IndexFlatL2 doesn't support remove)
        all_vectors = []
        new_id_map = {}
        for i in range(index.ntotal):
            if i == old_idx:
                continue
            new_id_map[str(len(all_vectors))] = id_map[str(i)]
            vec = index.reconstruct(i)
            all_vectors.append(vec)

        # Rebuild index
        index = faiss.IndexFlatL2(DIM)
        if all_vectors:
            index.add(np.array(all_vectors))

        id_map = new_id_map

    # Add new vector
    vector = np.array(vector, dtype=np.float32).reshape(1, -1)
    index.add(vector)
    id_map[str(index.ntotal - 1)] = user_id

    save_index(index)
    save_id_map(id_map)

    return {"status": "added", "user_id": user_id}

def query_embedding(vector, top_k=20):
    index = load_index()
    id_map = load_id_map()

    if index.ntotal == 0:
        return []

    vector = np.array(vector, dtype=np.float32).reshape(1, -1)
    D, I = index.search(vector, top_k)

    results = []
    for idx, dist in zip(I[0], D[0]):
        user_id = id_map.get(str(idx))
        if user_id:
            results.append({"userId": user_id, "score": float(dist)})
    return results

# CLI interface
if __name__ == "__main__":
    command = sys.argv[1]
    vector = json.loads(sys.argv[2])

    if command == "add":
        user_id = sys.argv[3]
        result = add_embedding(user_id, vector)
        print(json.dumps(result))  # ✅ stdout only for final result
    elif command == "query":
        result = query_embedding(vector)
        print(json.dumps(result))  # ✅ stdout only for final result