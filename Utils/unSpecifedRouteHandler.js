exports.unhandledRoutes = () => {
  return (req, res) => {
    return res.status(404).json({
      status: 404,
      success: false,
      message: `can't find ${req.originalUrl} on this server`,
      data: {},
    });
  };
};
