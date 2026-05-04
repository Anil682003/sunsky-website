import { createSlice } from '@reduxjs/toolkit';

const stored = localStorage.getItem('user');

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: stored ? JSON.parse(stored) : null,
    accessToken: localStorage.getItem('accessToken') || null,
    isAuthenticated: !!localStorage.getItem('accessToken'),
  },
  reducers: {
    loginSuccess(state, action) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.isAuthenticated = true;
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.isAuthenticated = false;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
    },
    updateUser(state, action) {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem('user', JSON.stringify(state.user));
    },
  },
});

export const { loginSuccess, logout, updateUser } = authSlice.actions;
export default authSlice.reducer;
