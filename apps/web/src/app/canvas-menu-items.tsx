import { MenuItem, MenuSeparator } from '@drawnix/drawnix';
import { LayersIcon, PlusIcon } from './canvas-icons';

type CanvasMenuItemsProps = {
  activeBoardName?: string;
  onCreate: () => void;
  onOpenList: () => void;
};

export const CanvasMenuItems = ({
  activeBoardName,
  onCreate,
  onOpenList,
}: CanvasMenuItemsProps) => {
  const activeBoardShortcut =
    activeBoardName && activeBoardName.length > 10
      ? `${activeBoardName.slice(0, 10)}…`
      : activeBoardName;

  return (
    <>
      <MenuItem icon={<PlusIcon />} onSelect={() => onCreate()}>
        新建画布
      </MenuItem>
      <MenuItem icon={<LayersIcon />} onSelect={() => onOpenList()} shortcut={activeBoardShortcut}>
        画布列表
      </MenuItem>
      <MenuSeparator />
    </>
  );
};
