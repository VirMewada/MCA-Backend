module.exports = {
  locationQuery: (longitude, latitude, km) => {
    return {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
        $maxDistance: Number(km) * 1000,
      },
    };
  },
};
