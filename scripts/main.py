# main.py
import sys
import json
from vectorizer import get_image_vector

sys.stderr.write(f"PYTHON: {sys.executable}\n")

if __name__ == "__main__":
    try:
        img_path = sys.argv[1]
        sys.stderr.write(f"Processing image: {img_path}\n")
        vector = get_image_vector(img_path)
        print(json.dumps(vector))
    except Exception as e:
        import traceback
        sys.stderr.write(json.dumps({"error": str(e), "trace": traceback.format_exc()}) + "\n")
        sys.exit(1)