import subprocess
import tempfile
import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI()


class TexRequest(BaseModel):
    tex: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/render")
async def render(req: TexRequest):
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "resume.tex")
        pdf_path = os.path.join(tmpdir, "resume.pdf")

        with open(tex_path, "w") as f:
            f.write(req.tex)

        result = subprocess.run(
            [
                "pdflatex",
                "-no-shell-escape",
                "-interaction=nonstopmode",
                "-output-directory", tmpdir,
                tex_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if not os.path.exists(pdf_path):
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "compile_failed",
                    "stdout": result.stdout[-3000:],
                    "stderr": result.stderr[-1000:],
                },
            )

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

    return Response(content=pdf_bytes, media_type="application/pdf")


@app.post("/compile-check")
async def compile_check(req: TexRequest):
    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "resume.tex")
        pdf_path = os.path.join(tmpdir, "resume.pdf")

        with open(tex_path, "w") as f:
            f.write(req.tex)

        result = subprocess.run(
            [
                "pdflatex",
                "-no-shell-escape",
                "-interaction=nonstopmode",
                "-output-directory", tmpdir,
                tex_path,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

        ok = os.path.exists(pdf_path)
        errors = []
        if not ok:
            for line in result.stdout.splitlines():
                if line.startswith("!") or "Error" in line:
                    errors.append(line)

        return {"ok": ok, "errors": errors, "raw_output": result.stdout[-3000:] if not ok else ""}
