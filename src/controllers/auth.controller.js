// Auth HTTP handlers. httpOnly cookies carry both access and refresh tokens
// (SameSite=strict, Secure in production) so client-side JS can't read them —
// defense against XSS-driven token theft. Bodies validated upstream via zod.
import { authService } from '../services/auth.store.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const ACCESS_COOKIE_MS = 15 * 60 * 1000; // 15 min — matches default JWT_ACCESS_TTL
const REFRESH_COOKIE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — matches JWT_REFRESH_TTL

function setCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  const common = { httpOnly: true, secure: isProduction, sameSite: 'strict' };
  res.cookie('accessToken', accessToken, { ...common, maxAge: ACCESS_COOKIE_MS });
  res.cookie('refreshToken', refreshToken, { ...common, maxAge: REFRESH_COOKIE_MS });
}

function clearCookies(res) {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.register(name, email, password);
  setCookies(res, accessToken, refreshToken);
  return res.status(201).json({ success: true, data: { userId: user._id, name: user.name, email: user.email } });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login(email, password);
  setCookies(res, accessToken, refreshToken);
  return res.status(200).json({ success: true, data: { userId: user._id, name: user.name, email: user.email } });
});

export const refresh = asyncHandler(async (req, res) => {
  const incoming = req.cookies?.refreshToken;
  const { accessToken, refreshToken } = await authService.refreshSession(incoming);
  setCookies(res, accessToken, refreshToken);
  return res.status(200).json({ success: true, data: null });
});

export const logout = asyncHandler(async (req, res) => {
  const incoming = req.cookies?.refreshToken;
  if (req.user?._id && incoming) {
    await authService.logout(req.user._id, incoming);
  }
  clearCookies(res);
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
