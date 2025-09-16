const tf = require("@tensorflow/tfjs-node");
const mobilenet = require("@tensorflow-models/mobilenet");

let model;

const loadModel = async () => {
  if (!model) {
    model = await mobilenet.load();
  }
};

const getImageEmbedding = async (buffer) => {
  await loadModel(); // ensure model is loaded
  const imageTensor = tf.node
    .decodeImage(buffer, 3)
    .resizeNearestNeighbor([224, 224])
    .expandDims(0)
    .toFloat()
    .div(255.0);

  const embedding = model.infer(imageTensor, true); // get embeddings
  return Array.from(embedding.dataSync());
};

module.exports = { getImageEmbedding };
