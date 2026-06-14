export const BASE_URL = "https://holidaybooking.be";
// export const BASE_URL = "http://91.134.71.79:5000/api";

/** Base URL for static uploads (logos, images). Strips /api from BASE_URL. */
export const UPLOAD_BASE_URL =
  BASE_URL.replace(/\/api\/?$/, "");
