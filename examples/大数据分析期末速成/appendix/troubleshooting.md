# 常见错误排错指南

> 收集考试和实际开发中最常见的 15 个错误/问题

---

## NumPy 部分

### 1. `IndexError: index 3 is out of bounds for axis 0 with size 3`

**原因**：访问数组时索引超出了范围。数组长度为 3，有效索引是 0、1、2。

**示例**：
```python
arr = np.array([10, 20, 30])
arr[3]   # ❌ 越界！最大索引是2
```

**解决方案**：检查数组长度，确保索引在 `0 ~ len(arr)-1` 范围内。

---

### 2. 布尔索引时忘记加括号导致报错

**原因**：复合条件中 `&` / `|` 的优先级高于比较运算符，必须加括号。

**示例**：
```python
arr = np.array([1, 2, 3, 4, 5, 6])
arr[arr > 2 & arr < 5]   # ❌ 报错！
```

**解决方案**：
```python
arr[(arr > 2) & (arr < 5)]  # ✅ 每个条件用括号包起来
```

---

### 3. `np.zeros(2,3)` 报错

**原因**：`np.zeros` 的形状参数必须是**元组**。

**示例**：
```python
np.zeros(2, 3)    # ❌ TypeError
```

**解决方案**：
```python
np.zeros((2, 3))  # ✅ 用圆括号包起来
```

---

### 4. 修改切片后发现原数组也被改了

**原因**：NumPy 的切片返回的是**视图 (view)**，不是副本。修改视图会影响原数组。

**示例**：
```python
arr = np.array([[1, 2], [3, 4]])
sub = arr[0:1, 0:1]
sub[0, 0] = 999
print(arr[0, 0])   # 999（原数组也被改了！）
```

**解决方案**：需要独立副本时用 `.copy()`：
```python
sub = arr[0:1, 0:1].copy()  # ✅ 创建副本
```

---

### 5. `a * b` 和 `a @ b` 搞混

**原因**：`*` 是逐元素乘法，`@` 才是矩阵乘法，两者结果完全不同。

**示例**：
```python
a = np.array([[1, 2], [3, 4]])
b = np.array([[5, 6], [7, 8]])
print(a * b)   # [[5 12] [21 32]]  逐元素乘
print(a @ b)   # [[19 22] [43 50]]  矩阵乘
```

---

## Pandas 部分

### 6. 使用 `df['列名']` 直接赋值产生警告

**原因**：对 DataFrame 的切片副本进行赋值时，Pandas 会发出 `SettingWithCopyWarning`。

**解决方案**：
```python
df.loc[:, "新列"] = values   # ✅ 用 loc 替代
# 或
df = df.copy()                # 先创建副本
df["新列"] = values
```

---

### 7. 条件筛选用 `and`/`or` 而不是 `&`/`|`

**原因**：Pandas 条件筛选使用 `&`（且）和 `|`（或），不是 Python 的 `and` 和 `or`。

**示例**：
```python
df[df["成绩"] >= 80 and df["年龄"] > 20]   # ❌ 报错
df[(df["成绩"] >= 80) & (df["年龄"] > 20)]  # ✅
```

---

### 8. 读取 CSV 中文乱码

**原因**：文件编码与 `read_csv` 默认编码不匹配。

**解决方案**：
```python
df = pd.read_csv("data.csv", encoding="utf-8")      # UTF-8
df = pd.read_csv("data.csv", encoding="gbk")         # 中文Windows常见
df = pd.read_csv("data.csv", encoding="utf-8-sig")   # 带BOM的UTF-8
```

---

### 9. `loc` 和 `iloc` 的切片行为混淆

**示例**：
```python
# iloc：整数位置，含头不含尾
df.iloc[0:3]   # 取第0、1、2行（不含3）

# loc：标签名称，含头含尾
df.loc[0:3]    # 取索引0、1、2、3（含3，比iloc多一行！）
```

**规律**：`iloc` 像 Python 列表切片，`loc` 像普通的坐标范围。

---

### 10. `groupby` 后忘记选择数值列

**示例**：
```python
df.groupby("班级").mean()          # 会对所有数值列计算均值
df.groupby("班级")["成绩"].mean()  # 只对"成绩"列计算均值（推荐）
```

**建议**：明确指定要聚合的列，避免对不需要的列（如学号）也做无意义聚合。

---

### 11. merge 后出现 `_x`、`_y` 后缀

**原因**：两个 DataFrame 在连接键之外还有同名列，自动加了后缀区分。

**解决方案**：
```python
pd.merge(df1, df2, on="学号", suffixes=("", "_重复"))
```

---

## Matplotlib 部分

### 12. 图表显示为空白

**原因**：忘记调用 `plt.show()`。

**解决方案**：在绘图代码末尾添加 `plt.show()`。

---

### 13. 中文显示为方框

**原因**：Matplotlib 默认字体不支持中文。

**解决方案**：
```python
plt.rcParams['font.sans-serif'] = ['SimHei']      # 黑体
plt.rcParams['axes.unicode_minus'] = False         # 解决负号显示问题
```

---

### 14. 子图标签重叠

**原因**：子图间距太小。

**解决方案**：
```python
plt.tight_layout()  # 自动调整子图间距
```

---

### 15. 保存的图片是空白

**原因**：`plt.savefig()` 在 `plt.show()` 之后调用，`show()` 清空了画布。

**解决方案**：
```python
plt.savefig("figure.png")  # ✅ 先保存
plt.show()                  # 再显示
```

---

## ⚡ 考前速记

| 场景 | 正解 |
|------|------|
| 数组创建 | `np.array()`, `np.arange()`, `np.zeros()` |
| 条件筛选 NumPy | `arr[条件]`, `arr[(条件1) & (条件2)]` |
| 条件筛选 Pandas | `df[df["列"] > 值]`, 用 `&` 且、`|` 或 |
| 缺失值 | `isna()` 检测, `fillna()` 填充, `dropna()` 删除 |
| 分组聚合 | `df.groupby("分组列")["数值列"].mean()` |
| 合并表 | `pd.merge(df1, df2, on="键", how="inner")` |
| 图表选择 | 趋势→折线, 对比→柱状, 比例→饼图, 分布→直方, 相关→散点 |
