from flask import Flask, request, jsonify
from deepface import DeepFace
import requests
import tempfile
import os

app = Flask(__name__)

@app.route("/compare", methods=["POST"])
def compare_faces():
    data = request.json
    ref_images = data.get("reference_images", [])
    target_url = data.get("target_image")

    if not ref_images or not target_url:
        return jsonify({"match": False})

    # download target image
    target_file = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
    target_file.write(requests.get(target_url).content)
    target_file.close()

    try:
        for ref in ref_images:
            ref_file = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
            ref_file.write(requests.get(ref).content)
            ref_file.close()

            result = DeepFace.verify(
                img1_path=ref_file.name,
                img2_path=target_file.name,
                enforce_detection=False
            )

            os.unlink(ref_file.name)

            if result["verified"]:
                os.unlink(target_file.name)
                return jsonify({"match": True})

        os.unlink(target_file.name)
        return jsonify({"match": False})

    except Exception as e:
        print("FACE ERROR:", e)
        return jsonify({"match": False})


if __name__ == "__main__":
    app.run(port=7000)
