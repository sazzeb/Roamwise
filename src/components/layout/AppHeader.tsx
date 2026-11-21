
"use client";

import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";

import {
  PRIMARY_NAVIGATION,
} from "@/features/planner/planner.config";

interface AppHeaderProps {
  currentStep: number;
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  profileOpen: boolean;

  onNavigate: (step: number) => void;
  onToggleSidebar: () => void;
  onToggleMobileMenu: () => void;
  onToggleProfile: () => void;
  onOpenProfile: () => void;
  onReset: () => void;
}

export function AppHeader({
  currentStep,
  sidebarOpen,
  mobileMenuOpen,
  profileOpen,
  onNavigate,
  onToggleSidebar,
  onToggleMobileMenu,
  onToggleProfile,
  onOpenProfile,
  onReset,
}: AppHeaderProps) {
  return (
    <header className="site-header">
      <div className="topbar">
        <div className="brand-group">
          <button
            className="brand"
            type="button"
            onClick={() => onNavigate(1)}
            aria-label="Roamwise homepage"
          >
            <span className="unt-logo-frame">
              <Image className="unt-logo" src="/unt-logo.svg" width={235} height={107}
                alt="University of North Texas" unoptimized />
            </span>

            <span>
              Roam
              <span className="brand-green">
                wise
              </span>
            </span>
          </button>

          <button
            type="button"
            className={`navigation-toggle ${
              sidebarOpen
                ? "navigation-toggle--active"
                : ""
            }`}
            aria-expanded={sidebarOpen}
            aria-controls="roamwise-step-navigation"
            aria-label={
              sidebarOpen
                ? "Hide step navigation"
                : "Show step navigation"
            }
            onClick={onToggleSidebar}
          >
            {sidebarOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}

            <span>
              {sidebarOpen ? "Hide steps" : "Show steps"}
            </span>
          </button>
        </div>

        <nav
          className="desktop-nav"
          aria-label="Primary navigation"
        >
          {PRIMARY_NAVIGATION.map(link => {
            const active =
              link.step === 7
                ? currentStep >= 7
                : currentStep === link.step;

            return (
              <button
                key={link.label}
                type="button"
                className={
                  active ? "nav-active" : ""
                }
                onClick={() => onNavigate(link.step)}
              >
                {link.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={onToggleProfile}
            aria-expanded={profileOpen}
          >
            Profile
          </button>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="profile-button"
            aria-label="Profile menu"
            aria-expanded={profileOpen}
            onClick={onToggleProfile}
          >
            <UserRound
              size={18}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            className="mobile-menu-button"
            aria-label={
              mobileMenuOpen
                ? "Close menu"
                : "Open menu"
            }
            aria-expanded={mobileMenuOpen}
            onClick={onToggleMobileMenu}
          >
            {mobileMenuOpen ? (
              <X size={22} />
            ) : (
              <Menu size={22} />
            )}
          </button>
        </div>

        {profileOpen && (
          <div className="profile-popover">
            <b>Roamwise preview</b>

            <p>
              Preferences are stored on this device.
            </p>

            <button
              type="button"
              onClick={onReset}
            >
              Reset trip preferences
            </button>
          </div>
        )}
      </div>

      {mobileMenuOpen && (
        <nav
          className="mobile-nav"
          aria-label="Mobile navigation"
        >
          {PRIMARY_NAVIGATION.map(link => (
            <button
              key={link.label}
              type="button"
              onClick={() => onNavigate(link.step)}
            >
              {link.label}
            </button>
          ))}

          <button
            type="button"
            onClick={onOpenProfile}
          >
            Profile
          </button>
        </nav>
      )}
    </header>
  );
}
