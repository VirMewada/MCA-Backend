const path = require("path");
const { spawn } = require("child_process");

const scriptPath = path.join(__dirname, "../scripts/faiss_indexer.py");
const pythonExecutable = path.join(__dirname, "../scripts/.venv/bin/python"); // 👈 use venv python

function runFaiss(command, vector, userId = null) {
  return new Promise((resolve, reject) => {
    // const args = ["python3", scriptPath, command, JSON.stringify(vector)];
    const args = [scriptPath, command, JSON.stringify(vector)];

    if (userId) args.push(userId);

    // const process = spawn(args[0], args.slice(1), {
    //   cwd: path.dirname(scriptPath),
    // });

    const process = spawn(pythonExecutable, args, {
      cwd: path.dirname(scriptPath),
    });

    let output = "";
    let error = "";

    process.stdout.on("data", (data) => {
      output += data.toString();
    });

    process.stderr.on("data", (data) => {
      error += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (err) {
          reject("Failed to parse FAISS response: " + err.message);
        }
      } else {
        reject("FAISS script error: " + error);
      }
    });
  });
}

module.exports = { runFaiss };
