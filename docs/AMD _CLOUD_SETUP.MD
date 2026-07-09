# 🚀 Kontrakt AMD Cloud Setup Log

This document records the end-to-end journey of setting up a self-hosted, GPU-accelerated AI backend for the Kontrakt application on an AMD Cloud machine. The goal was to run a **Vision OCR Model** and an **Injection Classifier** entirely on AMD hardware (ROCm) to fulfill hackathon requirements, bypassing gated third-party APIs.

---

## 🛑 The Challenges & Troubleshooting Journey

Setting up the AMD cloud environment was an epic battle against dependencies, SSL certificates, and regional firewalls. Here is how we tackled each roadblock:

### 1. The vLLM & CUDA Trap
* **The Plan:** We initially tried to serve the models using `vLLM` via Python.
* **The Error:** The server crashed with `AssertionError: DP adjusted local rank 0 is out of bounds for 0 devices` and missing `libcuda.so.1`.
* **The Cause:** The Python package manager (`uv`) was a little *too* smart and aggressively downloaded the standard NVIDIA (CUDA) versions of PyTorch and vLLM instead of the AMD ROCm versions, meaning the software literally couldn't speak to the AMD GPU.

### 2. The Great Firewall & SSL Errors
* **The Plan:** To avoid Python dependency hell, we pivoted to **Ollama**, a pre-packaged binary that handles AMD drivers automatically.
* **The Errors:** 
  * Running the official install script threw `SSL certificate problem: self-signed certificate`.
  * Falling back to a direct `wget` from GitHub resulted in brutal throttling (40 KB/s), giving an ETA of 7 hours.
  * Attempting to fix `apt-get` packages like `zstd` resulted in timeouts when reaching the `repo.radeon.com` servers.
* **The Cause:** We ultimately discovered the AMD cloud machine was located in a region with a highly restrictive firewall (e.g., the Great Firewall of China), which actively throttles GitHub and completely blocks `huggingface.co`. 

### 3. The "Aha!" Moment
* We noticed the cloud container was named **`Unsloth + llama.cpp for Radeon`**.
* This meant the ultra-fast C++ inference engine (`llama.cpp` and `llama-server`) was **already natively installed** and perfectly optimized for the AMD hardware! We didn't need vLLM, Python, or Ollama at all.

---

## 🏆 The Ultimate Solution

To bypass all firewalls and dependencies, we used raw, direct commands to pull models from a regional mirror and served them using the built-in `llama-server`.

### 1. Selecting the 2026 State-of-the-Art Models
To avoid Meta's licensing waitlists (which would have blocked the hackathon progress), we selected two of the most powerful **ungated** models available in the ~7B parameter class:
* **Vision / OCR:** `LLaVA-Phi-3-Mini` (Combines LLaVA's visual architecture with Microsoft's hyper-optimized Phi-3 reasoning engine).
* **Injection Classifier:** `Qwen2.5-7B-Instruct` (Alibaba's latest flagship 7B model, dominating the open-weight leaderboards).

### 2. Bypassing the Firewall (The Mirror Hack)
Instead of relying on blocked scripts, we used `curl` with the `-k` flag (to ignore SSL errors) and pulled the GGUF model files directly from `hf-mirror.com` (a proxy designed to bypass regional blocks):

```bash
# Vision Model
curl -k -L -o llava-phi-3-mini-int4.gguf https://hf-mirror.com/xtuner/llava-phi-3-mini-gguf/resolve/main/llava-phi-3-mini-int4.gguf
curl -k -L -o llava-phi-3-mini-mmproj-f16.gguf https://hf-mirror.com/xtuner/llava-phi-3-mini-gguf/resolve/main/llava-phi-3-mini-mmproj-f16.gguf

# Qwen Classifier
curl -k -L -o qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf
curl -k -L -o qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf
```

### 3. Launching the ROCm Servers
We spun up two background servers using `llama-server`. Crucially, we added the `--host 0.0.0.0` flag to expose them outside of the container's internal `localhost`:

**Terminal 1 (Port 8000 - Vision):**
```bash
llama-server -m llava-phi-3-mini-int4.gguf --mmproj llava-phi-3-mini-mmproj-f16.gguf --port 8000 --host 0.0.0.0
```

**Terminal 2 (Port 8001 - Classifier):**
```bash
llama-server -m qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf --port 8001 --host 0.0.0.0
```

### 4. Wiring the Backend
Finally, we retrieved the AMD machine's public IP address (`36.150.116.194`) using `curl -s ifconfig.me`. We injected this directly into the Kontrakt Node.js backend's `.env` file on the local Mac:

```env
AMD_BASE_URL=http://36.150.116.194:8000/v1
AMD_CLASSIFIER_BASE_URL=http://36.150.116.194:8001/v1
```

**Result:** The Kontrakt application is now fully integrated with a bespoke, self-hosted AI architecture running purely on AMD hardware. 🚀
