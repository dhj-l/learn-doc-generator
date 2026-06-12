# 第3章 Pandas 分组聚合与合并

> ⏱ 预计学习时间：1-2 小时 | 🎯 目标：掌握分组统计和多表合并操作，拿下 Pandas 压轴考点

## 🎯 本章目标

学习完本章，你将能够：
- 使用 groupby 进行分组统计
- 使用 agg 执行多个聚合操作
- 使用 merge/join/concat 合并多个 DataFrame
- 使用 pivot_table 制作透视表

## 📋 前置知识

> 建议先完成 [第2章 Pandas 基础与数据清洗](./02-pandas-basics.md)，特别是 DataFrame 操作和条件筛选部分。

---

## 💡 核心概念

## 3.1 分组聚合 groupby（超高频考点！）

分组聚合是数据分析中最常用的操作——**按某个字段分组，然后对每组进行统计**。

**生活中的类比**：按班级分组 → 计算每个班的平均分。这就是 groupby！

```python
import pandas as pd
import numpy as np

# ─── 准备数据 ───
data = {
    "班级": ["A班", "A班", "B班", "B班", "C班", "C班"],
    "姓名": ["张三", "李四", "王五", "赵六", "钱七", "孙八"],
    "成绩": [85, 92, 78, 88, 95, 70],
    "年龄": [20, 21, 19, 22, 20, 21]
}
df = pd.DataFrame(data)
print(df)
#    班级  姓名  成绩  年龄
# 0  A班  张三  85  20
# 1  A班  李四  92  21
# 2  B班  王五  78  19
# 3  B班  赵六  88  22
# 4  C班  钱七  95  20
# 5  C班  孙八  70  21

# ─── 基本用法：按班级分组，计算平均成绩 ───
print(df.groupby("班级")["成绩"].mean())
# 班级
# A班    88.5
# B班    83.0
# C班    82.5
# Name: 成绩, dtype: float64

# ─── 多个统计量一起算 ───
print(df.groupby("班级")["成绩"].agg(["mean", "std", "min", "max", "count"]))
#       mean       std  min  max  count
# 班级
# A班   88.5  4.949747   85   92      2
# B班   83.0  7.071068   78   88      2
# C班   82.5  17.67767   70   95      2

# ─── 对多列分别执行不同的聚合 ───
print(df.groupby("班级").agg({
    "成绩": ["mean", "max"],
    "年龄": "mean"
}))
#       成绩          年龄
#      mean  max   mean
# 班级
# A班  88.5   92  20.5
# B班  83.0   88  20.5
# C班  82.5   95  20.5
```

> **💡 考试重点**：`groupby("列名")["数值列"].mean()` 是最基本的分组聚合模式

### 分组后的常用操作

```python
# ─── 分组后可以对多个数值列统计 ───
print(df.groupby("班级")[["成绩", "年龄"]].mean())

# ─── size() 统计每组行数 ───
print(df.groupby("班级").size())
# 班级
# A班    2
# B班    2
# C班    2

# ─── 分组后遍历 ───
for name, group in df.groupby("班级"):
    print(f"===== {name} =====")
    print(group)

# ─── 按多列分组 ───
df["性别"] = ["男", "女", "男", "女", "男", "女"]
print(df.groupby(["班级", "性别"])["成绩"].mean())
```

---

## 3.2 聚合函数 agg

`agg` 可以同时应用多个聚合函数，非常灵活。

```python
# ─── 多种聚合方式 ───
result = df.groupby("班级")["成绩"].agg([
    ("平均分", "mean"),
    ("最高分", "max"),
    ("最低分", "min"),
    ("人数", "count"),
    ("标准差", "std")
])
print(result)
#       平均分  最高分  最低分  人数       标准差
# 班级
# A班   88.5    92    85    2  4.949747
# B班   83.0    88    78    2  7.071068
# C班   82.5    95    70    2  17.67767

# ─── 自定义聚合函数 ───
result = df.groupby("班级")["成绩"].agg(
    平均分=np.mean,
    极差=lambda x: x.max() - x.min()
)
print(result)
```

---

## 3.3 数据合并——concat 和 merge

### concat——纵向/横向拼接

```python
# ─── 纵向拼接（增加行） ───
df1 = pd.DataFrame({"姓名": ["张三", "李四"], "成绩": [85, 92]})
df2 = pd.DataFrame({"姓名": ["王五", "赵六"], "成绩": [78, 88]})

df_concat = pd.concat([df1, df2], ignore_index=True)
print(df_concat)
#    姓名  成绩
# 0  张三  85
# 1  李四  92
# 2  王五  78
# 3  赵六  88

# ─── 横向拼接（增加列） ───
df_age = pd.DataFrame({"年龄": [20, 21, 19, 22]})
df_full = pd.concat([df_concat, df_age], axis=1)
```

### merge——类似 SQL 的 JOIN（超高频考点！）

```python
# ─── 准备数据 ───
students = pd.DataFrame({
    "学号": [1001, 1002, 1003],
    "姓名": ["张三", "李四", "王五"],
    "班级": ["A班", "A班", "B班"]
})

scores = pd.DataFrame({
    "学号": [1001, 1002, 1003],
    "成绩": [85, 92, 78]
})

# ─── 内连接（inner）—— 只保留两边都有的 ───
result = pd.merge(students, scores, on="学号", how="inner")
print(result)
#     学号  姓名  班级  成绩
# 0  1001  张三  A班  85
# 1  1002  李四  A班  92
# 2  1003  王五  B班  78

# ─── 左连接（left）—— 保留左边所有行 ───
scores2 = pd.DataFrame({
    "学号": [1001, 1002],
    "成绩": [85, 92]
})
result_left = pd.merge(students, scores2, on="学号", how="left")
print(result_left)
#     学号  姓名  班级    成绩
# 0  1001  张三  A班  85.0
# 1  1002  李四  A班  92.0
# 2  1003  王五  B班   NaN   ← 右边没数据，填NaN

# ─── 连接类型总结 ───
pd.merge(df1, df2, on="key", how="inner")   # 内连接，默认值
pd.merge(df1, df2, on="key", how="left")    # 左连接
pd.merge(df1, df2, on="key", how="right")   # 右连接
pd.merge(df1, df2, on="key", how="outer")   # 外连接（全连接）

# ─── 连接键名不同的情况 ───
df_left = pd.DataFrame({"学号": [1001, 1002], "成绩": [85, 92]})
df_right = pd.DataFrame({"学生编号": [1001, 1002], "年龄": [20, 21]})
result = pd.merge(df_left, df_right, left_on="学号", right_on="学生编号")
```

> **💡 考试重点**：`merge` 的 `on`（相同列名）和 `left_on/right_on`（不同列名）、`how` 的四种连接方式（inner/left/right/outer）

### join——用索引合并

```python
# ─── join：基于索引进合并 ───
df1 = pd.DataFrame({"成绩": [85, 92]}, index=["张三", "李四"])
df2 = pd.DataFrame({"年龄": [20, 21]}, index=["张三", "李四"])
result = df1.join(df2)
print(result)
#     成绩  年龄
# 张三  85  20
# 李四  92  21
```

---

## 3.4 透视表 pivot_table

透视表让你能**按行和列两个维度同时分组**，像 Excel 的透视表。

```python
# ─── 准备数据 ───
data = {
    "姓名": ["张三", "李四", "王五", "赵六", "钱七", "孙八"],
    "班级": ["A班", "A班", "B班", "B班", "C班", "C班"],
    "课程": ["数学", "英语", "数学", "英语", "数学", "英语"],
    "成绩": [85, 92, 78, 88, 95, 70]
}
df = pd.DataFrame(data)

# ─── 基本透视表：班级为行、课程为列、成绩为值 ───
pivot = pd.pivot_table(df,
                       index="班级",      # 行索引
                       columns="课程",     # 列索引
                       values="成绩",      # 要聚合的值
                       aggfunc="mean")    # 聚合方式
print(pivot)
# 课程   数学    英语
# 班级
# A班   85.0  92.0
# B班   78.0  88.0
# C班   95.0  70.0

# ─── 多个聚合值 ───
pivot2 = pd.pivot_table(df,
                        index="班级",
                        columns="课程",
                        values="成绩",
                        aggfunc=["mean", "max"])
print(pivot2)

# ─── 填充 NaN ───
pivot3 = pd.pivot_table(df,
                        index="班级",
                        columns="课程",
                        values="成绩",
                        aggfunc="mean",
                        fill_value=0)     # 无数据处填0

# ─── 多级行索引 ───
data["性别"] = ["男", "女", "男", "女", "男", "女"]
df2 = pd.DataFrame(data)
pivot4 = pd.pivot_table(df2,
                        index=["班级", "性别"],
                        columns="课程",
                        values="成绩",
                        aggfunc="mean")
print(pivot4)
```

> **💡 考试重点**：`pivot_table` 的三个核心参数：`index`（行）、`columns`（列）、`values`（值）、`aggfunc`（聚合函数，默认 mean）

---

## 3.5 时间序列操作

```python
# ─── 创建日期范围 ───
dates = pd.date_range("2025-01-01", periods=5, freq="D")
print(dates)
# DatetimeIndex(['2025-01-01', '2025-01-02', '2025-01-03',
#                '2025-01-04', '2025-01-05'], dtype='datetime64[ns]', freq='D')

# ─── 以日期为索引 ───
df = pd.DataFrame({"销售额": [100, 150, 130, 200, 180]}, index=dates)
print(df)

# ─── 按时间筛选 ───
print(df["2025-01-02":"2025-01-04"])  # 日期切片，支持字符串

# ─── 按年/月/季度/周重采样 ───
# 先准备更多的数据
dates = pd.date_range("2025-01-01", periods=90, freq="D")
df = pd.DataFrame({"销售额": np.random.randint(100, 200, 90)}, index=dates)

# 按月汇总
print(df.resample("M").sum())    # 按月求和
print(df.resample("W").mean())   # 按周求平均

# ─── 常用频率 ───
# "D" 天, "W" 周, "M" 月, "Q" 季度, "Y" 年
```

---

## 🔨 实战演练

### 练习：学生成绩分组统计分析

**场景描述：**
你是一名班主任，需要统计各班级、各科目的成绩情况。

**你的任务：**
1. 创建包含班级、姓名、科目、成绩的 DataFrame
2. 按班级分组计算各科平均分
3. 用 pivot_table 制作班级×科目的透视表

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```python
import pandas as pd
import numpy as np

# 准备数据
data = {
    "班级": ["A班", "A班", "B班", "B班", "C班", "C班"],
    "姓名": ["张三", "李四", "王五", "赵六", "钱七", "孙八"],
    "科目": ["数学", "英语", "数学", "英语", "数学", "英语"],
    "成绩": [85, 92, 78, 88, 95, 70]
}
df = pd.DataFrame(data)

# 1. 按班级分组计算平均分
print(df.groupby("班级")["成绩"].mean())

# 2. 透视表
pivot = pd.pivot_table(df, index="班级", columns="科目", values="成绩", aggfunc="mean")
print(pivot)
```

**预期输出：**
```
班级
A班    88.5
B班    83.0
C班    82.5
Name: 成绩, dtype: float64

科目    数学    英语
班级
A班   85.0  92.0
B班   78.0  88.0
C班   95.0  70.0
```

</details>

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`df.groupby("班级")["成绩"].mean()` 做了什么？**
> A：按"班级"分组，计算每个班的"成绩"平均值。

**Q2：merge 的 how 参数有哪四种取值？**
> A：`inner`（内连接，默认）、`left`（左连接）、`right`（右连接）、`outer`（外连接/全连接）

**Q3：merge 时如果两边的连接键列名不同怎么办？**
> A：用 `left_on` 和 `right_on` 分别指定两边作为连接键的列名。

**Q4：pivot_table 的 index、columns、values 分别代表什么？**
> A：`index` 是行索引（按什么分组显示为行）、`columns` 是列索引（按什么分组显示为列）、`values` 是要聚合的数值列。

**Q5：`pd.concat([df1, df2])` 和 `pd.concat([df1, df2], axis=1)` 的区别？**
> A：默认 `axis=0` 纵向拼接（增加行），`axis=1` 横向拼接（增加列）。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `groupby("列")` 后直接 `["列2"]` 报错 | 列名不存在 | 检查列名是否拼写正确 |
| merge 后多了 `_x` `_y` 后缀 | 两边有重复列名 | 用 `suffixes=("", "_y")` 指定后缀 |
| pivot_table 结果有很多 NaN | 某些组合无数据 | 用 `fill_value=0` 填充 |
| concat 后索引重复 | 默认保留原索引 | 加 `ignore_index=True` |

---

## 📝 本章小结

- ✅ `groupby("分组列")["数值列"].mean()` 实现分组统计
- ✅ `agg()` 可以同时应用多个聚合函数
- ✅ `merge()` 实现表间连接（inner/left/right/outer）
- ✅ `concat()` 纵向或横向拼接
- ✅ `pivot_table()` 制作透视表

## ➡️ 下一章预告

> 数据分析和处理都学会了，接下来让数据**说话**！下一章我们将学习 Matplotlib 数据可视化——用图表展示数据分析结果。
> [下一章：Matplotlib 数据可视化](./04-matplotlib.md)
