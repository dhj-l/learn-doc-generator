# API 速查表（按考试频率排序）

> 考前快速翻阅，★ 越多越常考

---

## ⭐⭐⭐ NumPy（最高频）

| API | 说明 | 最简示例 |
|-----|------|----------|
| `np.array()` | 创建数组 | `np.array([1,2,3])` |
| `np.arange(n)` | 生成 0~n-1 | `np.arange(5)` → `[0 1 2 3 4]` |
| `np.zeros((r,c))` | 全0矩阵 | `np.zeros((2,3))` |
| `np.ones((r,c))` | 全1矩阵 | `np.ones((2,2))` |
| `.shape` | 查看形状 | `arr.shape` → `(3,4)` |
| `.dtype` | 查看数据类型 | `arr.dtype` → `int64` |
| `.reshape(r,c)` | 改变形状 | `arr.reshape(3,4)` |
| `.flatten()` | 展平为一维 | `arr.flatten()` |
| `.T` | 转置 | `arr.T` |
| `arr[行, 列]` | 索引访问 | `arr[1, 2]` |
| `arr[条件]` | 布尔索引 | `arr[arr > 5]` |
| `np.sum()` | 求和 | `np.sum(arr, axis=0)` |
| `np.mean()` | 平均值 | `np.mean(arr)` |
| `np.std()` | 标准差 | `np.std(arr)` |
| `np.max()` / `np.min()` | 最大/小值 | `np.max(arr)` |
| `np.dot(a,b)` / `a @ b` | 矩阵乘法 | `a @ b` |
| `np.sqrt()` | 开方 | `np.sqrt(arr)` |
| `np.random.rand(n)` | 均匀分布随机数 | `np.random.rand(3)` |
| `np.random.randint(l,h,s)` | 随机整数 | `np.random.randint(1,100,5)` |
| `np.linspace(s,e,n)` | 等间隔取数 | `np.linspace(0,1,5)` |

## ⭐⭐⭐ Pandas（最高频）

| API | 说明 | 最简示例 |
|-----|------|----------|
| `pd.read_csv()` | 读取CSV | `pd.read_csv("data.csv")` |
| `df.head(n)` | 查看前n行 | `df.head(10)` |
| `df.info()` | 基本信息 | `df.info()` |
| `df.describe()` | 统计描述 | `df.describe()` |
| `df.shape` | 行数列数 | `df.shape` → `(100, 5)` |
| `df["列名"]` | 选择单列 | `df["成绩"]` |
| `df[["列1","列2"]]` | 选择多列 | `df[["姓名","成绩"]]` |
| `df.iloc[行, 列]` | 整数位置索引 | `df.iloc[0:5, 0:3]` |
| `df.loc[行, 列]` | 标签索引 | `df.loc[0:5, "姓名":"成绩"]` |
| `df[条件]` | 条件筛选 | `df[df["成绩"] >= 80]` |
| `df.isna()` | 检测缺失值 | `df.isna().sum()` |
| `df.fillna(值)` | 填充缺失值 | `df.fillna(df.mean())` |
| `df.dropna()` | 删除缺失行 | `df.dropna()` |
| `df.groupby("列")["值"].mean()` | 分组聚合 | `df.groupby("班级")["成绩"].mean()` |
| `df.agg()` | 多个聚合 | `df.groupby("班")["成绩"].agg(["mean","max"])` |
| `pd.merge(df1, df2, on="键")` | 合并表 | `pd.merge(a, b, on="学号", how="inner")` |
| `pd.concat([df1, df2])` | 拼接 | `pd.concat([a, b], ignore_index=True)` |
| `pd.pivot_table(df, index=, columns=, values=)` | 透视表 | `pd.pivot_table(df, index="班级", columns="课程", values="成绩")` |
| `df.sort_values("列")` | 排序 | `df.sort_values("成绩", ascending=False)` |
| `df.drop_duplicates()` | 去重 | `df.drop_duplicates()` |
| `df.rename(columns={})` | 重命名列 | `df.rename(columns={"旧":"新"})` |

## ⭐⭐ Matplotlib

| API | 说明 | 最简示例 |
|-----|------|----------|
| `plt.subplots()` | 创建画布 | `fig, ax = plt.subplots()` |
| `ax.plot(x, y)` | 折线图 | `ax.plot(x, y, marker="o")` |
| `ax.bar(x, y)` | 柱状图 | `ax.bar(cats, vals)` |
| `ax.pie(sizes)` | 饼图 | `ax.pie(sizes, labels=labels)` |
| `ax.hist(data)` | 直方图 | `ax.hist(data, bins=10)` |
| `ax.scatter(x, y)` | 散点图 | `ax.scatter(x, y)` |
| `ax.set_title()` | 设置标题 | `ax.set_title("标题")` |
| `ax.set_xlabel()` | X轴标签 | `ax.set_xlabel("月份")` |
| `ax.set_ylabel()` | Y轴标签 | `ax.set_ylabel("销售额")` |
| `ax.legend()` | 显示图例 | `ax.legend()` |
| `ax.grid(True)` | 网格线 | `ax.grid(True, linestyle="--")` |
| `plt.savefig()` | 保存图片 | `plt.savefig("fig.png", dpi=150)` |
| `plt.show()` | 显示图表 | `plt.show()` |

## ⭐ Python 基础

| API | 说明 | 最简示例 |
|-----|------|----------|
| `len()` | 长度 | `len([1,2,3])` → `3` |
| `range(start, stop, step)` | 数字序列 | `range(1, 10, 2)` |
| `.append()` | 列表追加 | `lst.append(5)` |
| `.split()` | 字符串分割 | `"a,b,c".split(",")` |
| `with open() as f:` | 文件读写 | `with open("f.txt", "r") as f:` |
| `lambda x: 表达式` | 匿名函数 | `lambda x: x * 2` |
| `sorted(lst, key=lambda)` | 自定义排序 | `sorted(students, key=lambda s: s["score"])` |
| `[expr for x in iter if cond]` | 列表推导式 | `[x**2 for x in range(10) if x > 5]` |
