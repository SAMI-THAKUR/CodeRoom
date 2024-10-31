import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import passport from "passport";

const prisma = new PrismaClient();

const auth = (req, res) => {
  if (req.isAuthenticated()) {
    const user = req.user;
    user.password = undefined;
    return res.status(200).json({ user });
  } else {
    return res.status(401).json({ error: "Unauthorized" });
  }
};

// ---- Signup Function ---- //
const signup = async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters long" });
  }
  if (password.includes(" ")) {
    return res.status(400).json({ error: "Password cannot contain spaces" });
  }
  try {
    const existingUser = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await prisma.user.create({
      data: {
        name: name,
        email: email,
        password: hashedPassword,
      },
    });
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      user.password = undefined;
      user.googleId = undefined;
      return res.status(201).json({ message: "User created successfully", user });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Could not create user" });
  }
};

// ---- Login Function ---- //
const login = async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    req.login(user, (err) => {
      if (err) return next(err);
      user.password = undefined;
      user.googleId = undefined;
      return res.status(200).json({ message: "Login successful", user });
    });
  })(req, res, next);
};

// ---- Logout Function ---- //
const logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.status(200).json({ message: "Logout successful" });
  });
};

// ---- Google Authentication ---- //
const googleAuth = (req, res, next) => {
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
};

// ---- Google Auth Callback Route ---- //
const googleAuthCallback = (req, res, next) => {
  passport.authenticate("google", { failureRedirect: "/login" }, (err, user) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.redirect("/login");
    }
    req.login(user, (err) => {
      if (err) {
        return next(err);
      }
      user.password = undefined;
      user.googleId = undefined;
      return res.status(200).json({ message: "Login successful", user });
    });
  })(req, res, next);
};

export { auth, signup, login, logout, googleAuth, googleAuthCallback };
