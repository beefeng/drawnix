import { expect, test } from '@playwright/test';

test('creates, renames, switches and deletes canvases', async ({ page }) => {
  await page.goto('/');

  const trigger = page.getByRole('button', { name: '打开画布列表' });
  await expect(trigger).toContainText('未命名画布');

  await trigger.click();
  const panel = page.getByRole('dialog', { name: '我的画布' });
  await expect(panel).toBeVisible();

  await panel.getByRole('button', { name: '新建画布' }).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toContainText('未命名画布 2');
  await expect(trigger).toContainText('2');

  await trigger.click();
  await panel.getByRole('button', { name: '重命名画布 未命名画布 2' }).click();
  const nameInput = panel.getByRole('textbox', { name: '画布名称' });
  await nameInput.fill('发布计划');
  await nameInput.press('Enter');
  await panel.getByRole('button', { name: '关闭画布列表' }).click();

  await page.reload();
  await expect(trigger).toContainText('发布计划');
  await expect(trigger).toContainText('2');

  await trigger.click();
  await panel.getByText('未命名画布', { exact: true }).click();
  await expect(trigger).toContainText('未命名画布');

  await trigger.click();
  await panel.getByRole('button', { name: '删除画布 未命名画布' }).click();
  await expect(page.getByRole('heading', { name: '删除画布？' })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();

  await expect(trigger).toContainText('发布计划');
  await expect(trigger).toContainText('1');
});
