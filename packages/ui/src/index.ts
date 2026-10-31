// @mento/ui: owner Person 2. Design system shared by the whiteboard and the teacher UI.
// Tokens live in tokens.css (import "@mento/ui/tokens.css" once, in the root layout).
export { Button, InertButton, type ButtonProps, type ButtonSize, type ButtonVariant } from "./components/Button";
export { IconButton, type IconButtonProps, type IconButtonSize } from "./components/IconButton";
export { Chip, type ChipProps, type ChipVariant } from "./components/Chip";
export { Card, type CardProps } from "./components/Card";
export { Badge, SimulatedDataBadge, type BadgeProps, type BadgeTone } from "./components/Badge";
export { Spinner, type SpinnerProps } from "./components/Spinner";
export { VisuallyHidden } from "./components/VisuallyHidden";
export { cx } from "./components/cx";
export { Avatar, type AvatarProps, type AvatarSize } from "./components/Avatar";
export { initials } from "./components/initials";
export { TopBar, type TopBarNavItem, type TopBarProps } from "./components/TopBar";
export { Footer, type FooterProps } from "./components/Footer";
export { Modal, type ModalProps } from "./components/Modal";
export { Drawer, type DrawerProps } from "./components/Drawer";
export { Menu, type MenuItem, type MenuProps } from "./components/Menu";
export {
  LoadingOverlay,
  type LoadingOverlayProps,
  type LoadingStage,
  type LoadingStageState,
} from "./components/LoadingOverlay";
export { INERT_LABEL, inertClasses, inertProps } from "./components/inert";
export * from "./components/icons";
export { Orb, type OrbProps } from "./orb/Orb";
export {
  ORB_STATES,
  orbFace,
  orbFaceSrc,
  orbStateLabels,
  type OrbFace,
  type OrbState,
} from "./orb/orbModel";
