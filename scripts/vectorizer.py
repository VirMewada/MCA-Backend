# vectorizer.py
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import sys 

from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input
from tensorflow.keras.preprocessing import image
import numpy as np

model = MobileNetV2(weights='imagenet', include_top=False, pooling='avg')

def get_image_vector(img_path):
    sys.stderr.write(f"DEBUG: Loading image from {img_path}\n") 
    img = image.load_img(img_path, target_size=(224, 224))
    img_data = image.img_to_array(img)
    img_data = np.expand_dims(img_data, axis=0)
    img_data = preprocess_input(img_data)

    features = model.predict(img_data, verbose=0)  # suppress output
    return features.flatten().tolist()