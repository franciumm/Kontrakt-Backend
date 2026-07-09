import { User } from '../../DB/models/User.Model.js';
import { AuthService } from './auth.service.js';

/** @type {import('./auth.service.js').UserStore} */
const userStore = {
  findByEmail: (email) => User.findOne({ email }),
  findById: (id) => User.findById(id),
  create: ({ name, email, password }) => User.create({ name, email, password }),
  addRefreshToken: (userId, hashedToken) =>
    User.findByIdAndUpdate(userId, { $push: { refreshTokens: hashedToken } }),
  replaceRefreshToken: (userId, oldHash, newHash) =>
    User.findOneAndUpdate(
      { _id: userId, refreshTokens: oldHash },
      { $set: { 'refreshTokens.$': newHash } },
      { new: true }
    ),
  removeRefreshToken: (userId, hashedToken) =>
    User.findByIdAndUpdate(userId, { $pull: { refreshTokens: hashedToken } }),
  removeAllRefreshTokens: (userId) =>
    User.findByIdAndUpdate(userId, { $set: { refreshTokens: [] } }),
};

export const authService = new AuthService(userStore);
