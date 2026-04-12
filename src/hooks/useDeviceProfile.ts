import { useEffect, useMemo, useState } from "react";

type DeviceProfile = {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  hasTouch: boolean;
  width: number;
  deviceClass: "mobile" | "tablet" | "desktop";
};

function readProfile(): DeviceProfile {
  if (typeof window === "undefined") {
    return {
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      hasTouch: false,
      width: 1280,
      deviceClass: "desktop",
    };
  }

  const width = window.innerWidth || 1280;
  const touchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  const coarsePointer =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(pointer: coarse)").matches
      : false;
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const mobileUA = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const tabletUA =
    /iPad|Tablet|PlayBook|Silk/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && touchPoints > 1);
  const hasTouch = touchPoints > 0 || coarsePointer;

  const isMobile = width <= 820 || mobileUA;
  const isTablet = !isMobile && (width <= 1120 || tabletUA || (hasTouch && width <= 1280));
  const isDesktop = !isMobile && !isTablet;
  const deviceClass = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";

  return { isMobile, isTablet, isDesktop, hasTouch, width, deviceClass };
}

export function useDeviceProfile(pageId?: string): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => readProfile());

  useEffect(() => {
    const updateProfile = () => setProfile(readProfile());
    updateProfile();
    window.addEventListener("resize", updateProfile);
    window.addEventListener("orientationchange", updateProfile);
    return () => {
      window.removeEventListener("resize", updateProfile);
      window.removeEventListener("orientationchange", updateProfile);
    };
  }, []);

  useEffect(() => {
    const body = document.body;
    body.dataset.device = profile.deviceClass;
    body.dataset.touch = profile.hasTouch ? "true" : "false";
    if (pageId) body.dataset.page = pageId;

    body.classList.toggle("using-mobile-ui", profile.isMobile);
    body.classList.toggle("using-tablet-ui", profile.isTablet);
    body.classList.toggle("using-desktop-ui", profile.isDesktop);

    return () => {
      if (body.dataset.page === pageId) delete body.dataset.page;
    };
  }, [pageId, profile.deviceClass, profile.hasTouch, profile.isDesktop, profile.isMobile, profile.isTablet]);

  return useMemo(() => profile, [profile]);
}
