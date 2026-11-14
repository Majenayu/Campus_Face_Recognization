# Campus Face Recognition API reference

The active Express entry point is selected by the start script. The Node service provides registration, login, image scanning, match persistence, and face-list operations. `face_service.py` separately provides the Flask comparison endpoint.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/register` | Register a user and upload reference faces |
| `POST` | `/login` | Authenticate a user |
| `POST` | `/scan-drive` | Process a target image set |
| `POST` | `/save-match` | Save a match result |
| `POST` | `/get-matches` | Retrieve saved matches |
| `POST` | `/user-faces` | Retrieve registered face data |
| `POST` | `/clear-matches` | Clear match records |
| `POST` | `/compare` | Flask/DeepFace image comparison service |

Request fields and response shapes remain implementation-defined in the selected server file. Treat image URLs and biometric data as sensitive.
