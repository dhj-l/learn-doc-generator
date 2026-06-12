# 第2章 Pandas 基础与数据清洗

> ⏱ 预计学习时间：2-3 小时 | 🎯 目标：掌握 Pandas 核心数据结构，能完成数据读取、清洗、筛选等操作

## 🎯 本章目标

学习完本章，你将能够：
- 创建 Series 和 DataFrame
- 从 CSV/Excel 文件中读取数据
- 查看数据概况（head/info/describe）
- 使用 loc/iloc 进行精确筛选
- 处理缺失值（检测/填充/删除）
- 添加、删除、重命名列
- 用条件表达式过滤数据

## 📋 前置知识

> - [第0章 Python 基础速通](./00-python-crash.md)（特别是字典和列表）
> - [第1章 NumPy 数组操作](./01-numpy.md)（Pandas 底层基于 NumPy）

---

## 💡 核心概念

### 2.1 Pandas 是什么？

想象你有一张**Excel 表格**——有行有列，能做筛选、排序、统计、透视表。Pandas 就是 Python 里操作这种表格数据的工具。

```python
import pandas as pd     # 标准简写
import numpy as np      # Pandas 经常和 NumPy 一起用
```

Pandas 有两个核心数据结构：
- **Series**：一列数据（带标签的一维数组）
- **DataFrame**：一张表（多个 Series 组成的二维表格）

---

## 2.2 Series——一维数据

```python
import pandas as pd

# ─── 从列表创建 ───
s = pd.Series([85, 92, 78, 90])
print(s)
# 0    85
# 1    92
# 2    78
# 3    90
# dtype: int64

print(s.values)    # [85 92 78 90]  → NumPy 数组
print(s.index)     # RangeIndex(start=0, stop=4, step=1)  → 索引

# ─── 自定义索引 ───
s = pd.Series([85, 92, 78], index=["张三", "李四", "王五"])
print(s)
# 张三    85
# 李四    92
# 王五    78
# dtype: int64

print(s["张三"])    # 85  用索引访问
print(s["李四":"王五"])  # 切片也支持

# ─── 从字典创建 ───
scores = pd.Series({"张三": 85, "李四": 92, "王五": 78})
print(scores)
```

---

## 2.3 DataFrame——二维表格（核心！）

```python
# ─── 从字典列表创建（最常用方式） ───
data = {
    "姓名": ["张三", "李四", "王五", "赵六"],
    "年龄": [20, 21, 19, 22],
    "成绩": [85, 92, 78, 88],
    "专业": ["计算机", "大数据", "计算机", "大数据"]
}
df = pd.DataFrame(data)
print(df)
#    姓名  年龄  成绩   专业
# 0  张三  20  85  计算机
# 1  李四  21  92  大数据
# 2  王五  19  78  计算机
# 3  赵六  22  88  大数据

# ─── 从 NumPy 数组创建 ───
arr = np.array([[1, 2, 3], [4, 5, 6]])
df2 = pd.DataFrame(arr, columns=["A", "B", "C"])
print(df2)
```

---

## 2.4 查看数据概况

拿到数据后第一件事——**看看数据长什么样**。

```python
# ─── 查看前几行 ───
print(df.head())       # 默认前5行
print(df.head(3))      # 前3行
print(df.tail(2))      # 后2行

# ─── 基本信息 ───
print(df.info())
# <class 'pandas.core.frame.DataFrame'>
# RangeIndex: 4 entries, 0 to 3
# Data columns (total 4 columns):
#  #   Column  Non-Null Count  Dtype
# ---  ------  --------------  -----
#  0   姓名      4 non-null      object
#  1   年龄      4 non-null      int64
#  2   成绩      4 non-null      int64
#  3   专业      4 non-null      object
# dtypes: int64(2), object(2)
# memory usage: 256.0+ bytes

# ─── 统计描述 ───
print(df.describe())
#              年龄         成绩
# count   4.000000   4.000000
# mean   20.500000  85.750000
# std     1.290994   5.909033
# min    19.000000  78.000000
# 25%    19.750000  83.250000
# 50%    20.500000  86.500000
# 75%    21.250000  89.000000
# max    22.000000  92.000000

# ─── 基本属性 ───
print(df.shape)          # (4, 4)  行数和列数
print(df.columns)        # Index(['姓名', '年龄', '成绩', '专业'], dtype='object')
print(df.index)          # RangeIndex(start=0, stop=4, step=1)
print(len(df))           # 4  行数
print(df.dtypes)         # 每列的数据类型
```

> **💡 考试重点**：`head()`/`info()`/`describe()` 是数据分析"三板斧"

---

## 🔨 实战演练

### 练习：文件读写操作

```python
import pandas as pd
import numpy as np

# ─── 写入CSV ───
df = pd.DataFrame({"姓名": ["张三", "李四"], "成绩": [85, 92]})
df.to_csv("students.csv", index=False, encoding="utf-8-sig")

# ─── 读取CSV ───
df_read = pd.read_csv("students.csv", encoding="utf-8-sig")
print(df_read)

# 预期输出：
#    姓名  成绩
# 0  张三  85
# 1  李四  92
```

read_csv 常用参数：
- `encoding`: 编码（utf-8 / gbk / utf-8-sig）
- `sep`: 分隔符（默认逗号）
- `header`: 第几行为列名
- `usecols`: 只读取指定列
- `nrows`: 只读前 N 行

---

## 2.6 列操作

```python
# ─── 选择单列（返回 Series） ───
print(df["姓名"])           # 字典方式
print(df.姓名)              # 属性方式（列名不能有空格/特殊字符）

# ─── 选择多列（返回 DataFrame） ───
print(df[["姓名", "成绩"]])   # 注意是双中括号！

# ─── 添加新列 ───
df["等级"] = df["成绩"].apply(lambda x: "优秀" if x >= 90 else "良好")
# 或者更简单
df["是否及格"] = df["成绩"] >= 60

# ─── 删除列 ───
df_dropped = df.drop("等级", axis=1)    # axis=1 表示列，返回新DataFrame
df.drop("等级", axis=1, inplace=True)  # inplace=True 直接修改原对象

# ─── 重命名列 ───
df = df.rename(columns={"成绩": "分数", "姓名": "名字"})

# ─── 排序 ───
df_sorted = df.sort_values("分数", ascending=False)   # 降序
df_sorted = df.sort_values(["专业", "分数"], ascending=[True, False])  # 多列排序
```

> **💡 考试重点**：`df["列名"]` 选单列、`df[["列1","列2"]]` 选多列、`axis=1` 是列

---

## 2.7 行筛选——loc 和 iloc（高频考点！）

### iloc——按位置（整数索引）

```python
# ─── iloc：用 整数位置 选择 ───
print(df.iloc[0])           # 第1行
print(df.iloc[1:3])         # 第2~3行
print(df.iloc[[0, 2]])      # 第1行和第3行
print(df.iloc[0, 1])        # 第1行第2列（单个值）
print(df.iloc[1:3, 0:2])    # 第2-3行、第1-2列
```

### loc——按标签（行名/列名）

```python
# ─── loc：用 标签/名称 选择 ───
print(df.loc[0])            # 行索引为0的行
print(df.loc[0:2])          # 行索引0到2（包含2！和iloc不同）
print(df.loc[:, "姓名"])    # 所有行的"姓名"列
print(df.loc[0:2, ["姓名", "成绩"]])  # 前3行的姓名和成绩
```

### iloc vs loc 核心区别

| 操作 | iloc | loc |
|------|------|-----|
| 基于 | 整数位置（类似列表） | 标签名称 |
| `[0:2]` 含义 | 第0行、第1行（不含2） | 标签0到标签2（含2） |
| 典型用法 | `df.iloc[0:5, 0:3]` | `df.loc["A":"C", "姓名":"成绩"]` |

```python
print(df.iloc[0:2])         # 前2行（不含第2行）→ 0,1
print(df.loc[0:2])          # 索引0到2（含2）→ 0,1,2
```

> **💡 考试重点**：`iloc` 整数位置含头不含尾、`loc` 标签含头**含尾**、`df.iloc[行, 列]`

---

## 2.8 条件筛选

```python
# ─── 单条件 ───
print(df[df["成绩"] >= 85])          # 成绩≥85的行
print(df[df["专业"] == "大数据"])     # 大数据专业的行

# ─── 多条件（注意括号！） ───
print(df[(df["成绩"] >= 80) & (df["专业"] == "计算机")])   # 且
print(df[(df["成绩"] < 60) | (df["年龄"] > 21)])           # 或

# ─── 使用 isin() 筛选多个值 ───
print(df[df["专业"].isin(["计算机", "大数据"])])

# ─── 使用 ~ 取反 ───
print(df[~(df["专业"] == "大数据")])  # 非大数据专业

# ─── between() 范围筛选 ───
print(df[df["成绩"].between(80, 90)])  # 成绩在80~90之间

# ─── 字符串方法 ───
print(df[df["姓名"].str.contains("张")])  # 姓名包含"张"
```

---

## 2.9 缺失值处理（高频考点！）

实际数据中经常有缺失值，Pandas 中用 `NaN` 表示。

```python
# ─── 创建含缺失值的数据 ───
data = {
    "姓名": ["张三", "李四", "王五", "赵六"],
    "成绩": [85, None, 78, None],
    "年龄": [20, 21, None, 22]
}
df = pd.DataFrame(data)
print(df)
#    姓名    成绩    年龄
# 0  张三  85.0  20.0
# 1  李四   NaN  21.0
# 2  王五  78.0   NaN
# 3  赵六   NaN  22.0

# ─── 检测缺失值 ───
print(df.isna())          # 每个位置是否为NaN
print(df.isna().sum())    # 每列的缺失值个数

# ─── 删除缺失值 ───
print(df.dropna())               # 删除有缺失值的行（默认any）
print(df.dropna(how="all"))      # 仅当整行全为NaN时才删除
print(df.dropna(subset=["成绩"])) # 只在"成绩"列检测缺失
print(df.dropna(axis=1))         # 删除有缺失值的列

# ─── 填充缺失值 ───
print(df.fillna(0))              # 用0填充
print(df.fillna(df.mean()))      # 用每列均值填充（最常用！）
print(df["成绩"].fillna(df["成绩"].mean()))  # 仅填充"成绩"列

# ─── 向前/向后填充 ───
print(df.fillna(method="ffill"))  # 用上一条数据填充（forward fill）
print(df.fillna(method="bfill"))  # 用下一条数据填充（backward fill）
```

> **💡 考试重点**：`isna()` 检测、`fillna(value)` 填充、`dropna()` 删除、均值填充是最常用策略

---

## 2.10 数据去重与替换

```python
# ─── 去重 ───
df_unique = df.drop_duplicates()              # 删除完全重复的行
df_unique = df.drop_duplicates(subset=["姓名"]) # 按"姓名"列去重

# ─── 替换 ───
df["成绩"] = df["成绩"].replace(0, 60)        # 把0换成60
df["专业"] = df["专业"].replace({"计算机": "CS", "大数据": "BD"})  # 字典替换

# ─── apply 自定义处理 ───
df["成绩分类"] = df["成绩"].apply(lambda x: "及格" if x >= 60 else "不及格")
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：`df.head(10)` 的作用是什么？**
> A：显示 DataFrame 的前 10 行数据。

**Q2：`iloc[0:3]` 和 `loc[0:3]` 的区别？**
> A：`iloc[0:3]` 取第0、1、2行（不含3），`loc[0:3]` 取索引标签0到3（含3）。如果索引是默认的0~N-1，loc 多取一行。

**Q3：`df[df["成绩"] > 80]` 实现什么功能？**
> A：筛选出"成绩"列大于80的所有行。

**Q4：缺失值处理的常用方法有哪些？**
> A：① `dropna()` 删除 ② `fillna(值)` 填充 ③ `fillna(均值)` 用均值填充（最常用）

**Q5：`df["新列"] = ...` 实现什么？**
> A：添加一个新列，或修改已有列的值。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `df['Col Name'] = ...` 产生警告 | 链式赋值 | 用 `df.loc[:, 'Col Name'] = ...` |
| `df[df.成绩 > 80 & df.年龄 > 20]` 报错 | 缺少括号 | 写为 `df[(df.成绩 > 80) & (df.年龄 > 20)]` |
| `read_csv` 中文乱码 | 编码问题 | 加 `encoding="utf-8"` 或 `"gbk"` |
| `SettingWithCopyWarning` | 视图/副本混淆 | 用 `.copy()` 创建独立副本 |

---

## 📝 本章小结

- ✅ Series 是一维数据，DataFrame 是二维表格
- ✅ `read_csv()` 读数据、`head/info/describe` 看数据
- ✅ `loc` 按标签、`iloc` 按位置筛选行和列
- ✅ 条件筛选：`df[df["列"] > 值]`
- ✅ 缺失值：`isna()` 检测、`fillna()` 填充、`dropna()` 删除
- ✅ 列操作：添加、删除、重命名、排序

## ➡️ 下一章预告

> 掌握了 Pandas 基础操作后，下一章我们将深入学习**分组聚合与合并**——这是考试中占比最大的 Pandas 考点！
> [下一章：Pandas 分组聚合与合并](./03-pandas-advanced.md)
