// Shared admin API hooks and utilities.
import axios from 'axios';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';

export function getHttpStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

export function getAxiosMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? err.message;
  }
  return 'Đã xảy ra lỗi không xác định.';
}

export function useAuthRedirect(error: unknown, skip?: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (skip) return;
    const status = getHttpStatus(error);
    if (status === 401) {
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      navigate(`/dang-nhap?returnUrl=${returnUrl}`);
    }
  }, [error, navigate, location, skip]);
}

export function actionErrorMessage(err: unknown): string {
  const status = getHttpStatus(err);
  switch (status) {
    case 401:
      return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.';
    case 403:
      return 'Bạn không có quyền thực hiện thao tác này.';
    case 404:
      return 'Không tìm thấy tài nguyên.';
    case 409:
      return getAxiosMessage(err);
    case 400:
      return getAxiosMessage(err);
    default:
      return getAxiosMessage(err);
  }
}
