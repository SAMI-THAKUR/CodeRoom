const auth = (req, res, next) => {
  if (req.isAuthenticated()) {
    const user = req.user;
    user.password = undefined;
    req.userId = user.id;
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
};

export default auth;
