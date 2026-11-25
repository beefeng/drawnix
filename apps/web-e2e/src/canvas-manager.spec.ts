import { expect, test, type Page } from '@playwright/test';

type AgentWindow = Window & {
  drawnixAgent: {
    addElements: (elements: Array<Record<string, unknown>>) => void;
    getElements: () => Array<{ id: string }>;
  };
};

const openAppMenu = async (page: Page) => {
  const newCanvasItem = page.getByRole('button', { name: '新建画布' });
  if (!(await newCanvasItem.isVisible())) {
    await page.getByRole('button', { name: '应用菜单' }).click();
  }
  await expect(newCanvasItem).toBeVisible();
};

const expectBoardInAppMenu = async (page: Page, boardName: string) => {
  await expect
    .poll(async () => {
      await openAppMenu(page);
      return (
        (await page
          .getByRole('button', { name: /画布列表/ })
          .textContent()
          .catch(() => '')) ?? ''
      );
    })
    .toContain(boardName);
};

test('creates, renames, switches and deletes canvases', async ({ page }) => {
  await page.goto('/');

  await expectBoardInAppMenu(page, '未命名画布');
  await page.getByRole('button', { name: /画布列表/ }).click();
  const panel = page.getByRole('dialog', { name: '我的画布' });
  await panel.getByRole('button', { name: '重命名画布 未命名画布' }).click();
  const nameInput = panel.getByRole('textbox', { name: '画布名称' });
  await nameInput.fill('设计稿');
  await nameInput.press('Enter');
  await panel.getByRole('button', { name: '关闭画布列表' }).click();

  await expectBoardInAppMenu(page, '设计稿');
  await page.getByRole('button', { name: '新建画布' }).click();
  await expectBoardInAppMenu(page, '未命名画布');

  await page.getByRole('button', { name: /画布列表/ }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: '重命名画布 未命名画布' }).click();
  await nameInput.fill('发布计划');
  await nameInput.press('Enter');
  await panel.getByRole('button', { name: '关闭画布列表' }).click();

  await page.reload();
  await expectBoardInAppMenu(page, '发布计划');
  await page.getByRole('button', { name: /画布列表/ }).click();

  await panel.getByText('设计稿', { exact: true }).click();
  await expect(panel).toBeHidden();
  await expectBoardInAppMenu(page, '设计稿');

  await page.getByRole('button', { name: '新建画布' }).click();
  await expectBoardInAppMenu(page, '未命名画布');

  await page.getByRole('button', { name: /画布列表/ }).click();
  await panel.getByRole('button', { name: '删除画布 未命名画布' }).click();
  await expect(page.getByRole('heading', { name: '删除画布？' })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();

  await expect(panel.getByText('发布计划', { exact: true })).toBeVisible();
  await expect(panel.getByText('设计稿', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '关闭画布列表' }).click();

  await expectBoardInAppMenu(page, '发布计划');
});

test('keeps canvas content after reload', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as AgentWindow).drawnixAgent));

  await page.evaluate(() => {
    (window as AgentWindow).drawnixAgent.addElements([
      {
        id: 'persist-shape',
        shape: 'rectangle',
        x: 40,
        y: 40,
        width: 160,
        height: 80,
        text: '自动保存检查',
      },
    ]);
  });
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (window as AgentWindow).drawnixAgent.getElements().length;
      });
    })
    .toBeGreaterThan(0);

  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForFunction(() => Boolean((window as AgentWindow).drawnixAgent));

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (window as AgentWindow).drawnixAgent
          .getElements()
          .some((element) => element.id === 'persist-shape');
      });
    })
    .toBe(true);
});

test('asks to save the current canvas before creating another one', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as AgentWindow).drawnixAgent));

  await page.evaluate(() => {
    (window as AgentWindow).drawnixAgent.addElements([
      {
        id: 'unsaved-shape',
        shape: 'rectangle',
        x: 40,
        y: 40,
        width: 160,
        height: 80,
        text: '未保存内容',
      },
    ]);
  });
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (window as AgentWindow).drawnixAgent.getElements().length;
      });
    })
    .toBeGreaterThan(0);

  await openAppMenu(page);
  await page.getByRole('button', { name: '新建画布' }).click();

  await expect(page.getByRole('heading', { name: '先保存当前画布？' })).toBeVisible();
  await page.getByRole('button', { name: '不保存，直接新建' }).click();
  await expect(page.getByRole('heading', { name: '先保存当前画布？' })).toBeHidden();

  await expectBoardInAppMenu(page, '未命名画布');
  expect(
    await page.evaluate(() => {
      return (window as AgentWindow).drawnixAgent.getElements().length;
    })
  ).toBe(0);
});

test('saves the canvas file and adopts the chosen file name', async ({ page }) => {
  await page.addInitScript(() => {
    const fakeWindow = window as unknown as {
      showSaveFilePicker?: () => Promise<unknown>;
      __savePickerCalls?: number;
    };
    fakeWindow.__savePickerCalls = 0;
    fakeWindow.showSaveFilePicker = async () => {
      fakeWindow.__savePickerCalls = (fakeWindow.__savePickerCalls ?? 0) + 1;
      return {
        kind: 'file',
        name: '项目规划.drawnix',
        createWritable: async () => ({
          write: async () => undefined,
          close: async () => undefined,
        }),
      };
    };
  });

  await page.goto('/');
  await expectBoardInAppMenu(page, '未命名画布');
  await page.getByRole('button', { name: '另存为' }).click();

  await expectBoardInAppMenu(page, '项目规划');
  expect(
    await page.evaluate(() => {
      return (window as unknown as { __savePickerCalls?: number }).__savePickerCalls;
    })
  ).toBe(1);
});
