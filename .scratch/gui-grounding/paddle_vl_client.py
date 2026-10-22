#!/usr/bin/env python3
"""paddle_vl_client.py — 百度 PaddleOCR-VL 云端 API 客户端（资产，2026-10-17 用户提供脚本 CLI 化）。
用法:
  python3 paddle_vl_client.py IMG1 [IMG2 ...] [-o outdir] [--model PaddleOCR-VL-1.6] [--poll 5]
  环境变量 PADDLE_VL_TOKEN 可覆盖默认 token。
依赖: requests（系统 python3.14 自带 2.34.2，已验证）。
输出: outdir/<name>/meta.json（含 submit/total 秒数与状态转移）+ doc_N.md + 图片。
注意: 图片会上传到百度云端（走本机代理）；token 属用户，勿外传。
来源: 用户 2026-10-17 提供的 aistudio-app.com /api/v2/ocr/jobs 脚本，逻辑保持一致。
"""
import argparse, json, os, sys, time
import requests

JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"
TOKEN = os.environ.get("PADDLE_VL_TOKEN", "76ba9516398ab182369ef4a66a20603ed3116733")

def process_file(file_path, out_dir, model, poll_secs, optional_payload):
    headers = {"Authorization": f"bearer {TOKEN}"}
    t0 = time.perf_counter()
    if file_path.startswith("http"):
        headers["Content-Type"] = "application/json"
        payload = {"fileUrl": file_path, "model": model, "optionalPayload": optional_payload}
        r = requests.post(JOB_URL, json=payload, headers=headers)
    else:
        if not os.path.exists(file_path):
            print(f"[ERR] file not found: {file_path}")
            return None
        data = {"model": model, "optionalPayload": json.dumps(optional_payload)}
        with open(file_path, "rb") as f:
            r = requests.post(JOB_URL, headers=headers, data=data, files={"file": f})
    submit_secs = time.perf_counter() - t0
    if r.status_code != 200:
        print(f"[ERR] submit {r.status_code}: {r.text[:300]}")
        return None
    job_id = r.json()["data"]["jobId"]
    print(f"[{os.path.basename(file_path)}] job={job_id} submit={submit_secs:.2f}s", flush=True)
    states = []
    jsonl_url = ""
    while True:
        jr = requests.get(f"{JOB_URL}/{job_id}", headers=headers)
        if jr.status_code != 200:
            print(f"[ERR] poll {jr.status_code}: {jr.text[:200]}")
            return None
        d = jr.json()["data"]
        state = d["state"]
        if not states or states[-1][0] != state:
            states.append((state, round(time.perf_counter() - t0, 2)))
        if state == "done":
            jsonl_url = d["resultUrl"]["jsonUrl"]
            break
        if state == "failed":
            print(f"[ERR] job failed: {d.get('errorMsg')}")
            return None
        time.sleep(poll_secs)
    total_secs = time.perf_counter() - t0
    res = requests.get(jsonl_url)
    res.raise_for_status()
    os.makedirs(out_dir, exist_ok=True)
    texts, pages = [], 0
    # 2026-10-22 修：requests 对无 charset 的 text/* 默认按 ISO-8859-1(latin-1) 解码，
    # 会把 API 返回的 UTF-8 中文变成 "è™šæ¸Š…"（长行还会二次损坏不可逆）。
    # 必须按字节取回再显式 utf-8 解码。
    body = res.content.decode("utf-8", errors="replace")
    for line in body.strip().split("\n"):
        if not line.strip():
            continue
        for rp in json.loads(line)["result"]["layoutParsingResults"]:
            md = rp["markdown"]["text"]
            with open(os.path.join(out_dir, f"doc_{pages}.md"), "w", encoding="utf-8") as f:
                f.write(md)
            texts.append(md)
            for img_path, img in rp["markdown"].get("images", {}).items():
                try:
                    p = os.path.join(out_dir, img_path)
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    with open(p, "wb") as f:
                        f.write(requests.get(img).content)
                except Exception as e:
                    print(f"[WARN] 内嵌图片下载失败（不影响文字结果）: {img_path}: {type(e).__name__}", flush=True)
            pages += 1
    meta = dict(file=file_path, model=model, job_id=job_id, submit_secs=round(submit_secs, 2),
                total_secs=round(total_secs, 2), states=states, pages=pages)
    json.dump(meta, open(os.path.join(out_dir, "meta.json"), "w"), ensure_ascii=False, indent=1)
    print(f"[{os.path.basename(file_path)}] done in {total_secs:.1f}s pages={pages}", flush=True)
    return meta

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("-o", "--out", default="output")
    ap.add_argument("--model", default="PaddleOCR-VL-1.6")
    ap.add_argument("--poll", type=float, default=5)
    args = ap.parse_args()
    opt = {"useDocOrientationClassify": False, "useDocUnwarping": False, "useChartRecognition": False}
    metas = []
    for fp in args.files:
        name = os.path.splitext(os.path.basename(fp.split("?")[0]))[0]
        m = process_file(fp, os.path.join(args.out, name), args.model, args.poll, opt)
        if m:
            metas.append(m)
    print(json.dumps(metas, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
