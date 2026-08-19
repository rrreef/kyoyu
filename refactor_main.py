import sys

def refactor():
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "r") as f:
        content = f.read()

    body_idx = content.find("var body: some View {")
    zstack_idx = content.find("ZStack(alignment: .topTrailing) {", body_idx)
    vstack_idx = content.find("VStack(spacing: 0) {", zstack_idx)
    
    # find the matching closing bracket for VStack
    count = 0
    end_vstack = -1
    for i in range(vstack_idx, len(content)):
        if content[i] == '{':
            count += 1
        elif content[i] == '}':
            count -= 1
            if count == 0:
                end_vstack = i
                break
                
    vstack_content = content[vstack_idx:end_vstack+1]
    
    # replace it in body
    new_content = content[:vstack_idx] + "mainContent()" + content[end_vstack+1:]
    
    # insert the new function
    struct_end = new_content.find("private func plainText")
    
    func_def = f"""
    @ViewBuilder
    private func mainContent() -> some View {{
{vstack_content}
    }}
"""
    new_content = new_content[:struct_end] + func_def + "\n    " + new_content[struct_end:]
    
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", "w") as f:
        f.write(new_content)
    print("Extracted mainContent!")

refactor()
