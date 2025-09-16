const { spawn } = require("child_process");
const path = require("path");

function getImageVector(imagePath) {
  return new Promise((resolve, reject) => {
    // const pythonScript = "main.py";
    // const scriptPath = "/Users/veermewada/Downloads/photo_vectorizer";
    // const pythonExecutable =
    //   "/Users/veermewada/Downloads/photo_vectorizer/venv/bin/python";

    // const process = spawn(
    //   pythonExecutable,
    //   [pythonScript, imagePath], // ✅ this now passes the actual image path
    //   { cwd: scriptPath }
    // );
    const scriptPath = path.join(__dirname, "../scripts"); // Adjust if needed
    const pythonScript = path.join(scriptPath, "main.py");
    // const pythonExecutable =
    //   "/Users/veermewada/Downloads/castin-app-backend-main 3/scripts/.venv/bin/python";

    const pythonExecutable = path.join(scriptPath, ".venv", "bin", "python");

    console.log(
      `Spawning Python process: ${pythonExecutable} ${pythonScript} ${imagePath} (CWD: ${scriptPath})`
    );

    const process = spawn(
      pythonExecutable,
      // "/opt/homebrew/opt/python@3.10/bin/python3.10", // Use default python3 in system path (or venv activated in prod)
      [pythonScript, imagePath],
      { cwd: scriptPath }
    );

    let output = "";

    let stdoutData = ""; // Renamed for clarity: captures stdout
    let stderrData = ""; // Captures stderr

    process.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    process.stderr.on("data", (err) => {
      console.error("Python stderr output:", err.toString());
      stderrData += err.toString();
    });

    process.on("error", (err) => {
      // Handle errors like executable not found, permissions issues
      console.error("Failed to start Python subprocess:", err);
      reject(`Failed to start Python subprocess: ${err.message}`);
    });

    process.on("close", (code) => {
      if (code === 0) {
        // Python script exited successfully
        try {
          const vector = JSON.parse(stdoutData.trim()); // Trim whitespace
          resolve(vector);
        } catch (e) {
          // If JSON parsing fails even with exit code 0, it's an issue
          console.error(
            "Error parsing Python script stdout to JSON:",
            e.message
          );
          console.error("Full stdout:", stdoutData);
          reject(
            "Error parsing vector from Python script output: " + e.message
          );
        }
      } else {
        // Python script exited with a non-zero error code
        console.error(`Python script exited with code ${code}.`);
        console.error("Python stdout:", stdoutData); // What did stdout contain?
        console.error("Python stderr:", stderrData); // What did stderr contain?

        // Attempt to parse error JSON from stderr if main.py prints it there on error
        try {
          const errorInfo = JSON.parse(stderrData.trim());
          if (errorInfo.error) {
            reject(
              `Python script error: ${errorInfo.error}\nTrace: ${
                errorInfo.trace || "No traceback provided."
              }`
            );
          } else {
            reject(
              `Python script exited with code ${code}. Stderr:\n${stderrData}`
            );
          }
        } catch (parseError) {
          // If stderr is not valid JSON, just reject with the raw stderr
          reject(
            `Python script exited with code ${code}. Stderr:\n${stderrData}`
          );
        }
      }
    });
  });
}

module.exports = { getImageVector };
