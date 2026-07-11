// Auth HTTP handlers. Tokens are returned in the JSON payload, enabling clients
// to store them in memory and send them via the Authorization header.
// Bodies validated upstream via zod.
import { authService } from '../services/auth.store.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.register(name, email, password);
  return res.status(201).json({ 
    success: true, 
    data: { userId: user._id, name: user.name, email: user.email, accessToken, refreshToken } 
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login(email, password);
  return res.status(200).json({ 
    success: true, 
    data: { userId: user._id, name: user.name, email: user.email, accessToken, refreshToken } 
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const incoming = req.body.refreshToken; // Client must now send refresh token in the body
  if (!incoming) throw new AppError('Refresh token missing from request body', 400, 'REFRESH_TOKEN_MISSING');
  
  const { accessToken, refreshToken } = await authService.refreshSession(incoming);
  return res.status(200).json({ 
    success: true, 
    data: { accessToken, refreshToken } 
  });
});

export const logout = asyncHandler(async (req, res) => {
  const incoming = req.body.refreshToken;
  if (req.user?._id && incoming) {
    await authService.logout(req.user._id, incoming);
  }
  return res.status(200).json({ success: true, data: null });
});

export const getMe = asyncHandler(async (req, res) => {
  if (!req.user?._id) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const user = await authService.userStore.findById(req.user._id);
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  return res.status(200).json({
    success: true,
    data: { _id: String(user._id), name: user.name, email: user.email, role: user.role },
  });
});
